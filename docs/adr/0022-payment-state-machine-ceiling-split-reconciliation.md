# ADR-0022: Payment State Machine + Idempotency + Reconciliation Sweep + Ceiling-Split

**Issue**: #21 · **Milestone**: M6 — Payments & Settlement · **Status**: Accepted (Round 2 — blocking items resolved)

---

## Context

Issue #21 addresses payment correctness under every failure mode. The existing
payment service (`payment-service.ts` from issue #20) had the correct `verifying`
comment in the state machine diagram but no actual `pending → verifying` transition
implementation, no ceiling-split handler, and no reconciliation sweep.

Three risks existed with the prior state:

1. **Double-apply**: two concurrent callbacks (e.g. gateway retry + browser refresh)
   could both call `recordPaymentVerified` simultaneously, each seeing `status=pending`,
   and both apply — crediting `order.amountPaid` twice.
2. **Missing ceiling-split**: bills exceeding the IPG per-transaction ceiling have no
   split path; such orders would fail at the gateway or be rejected.
3. **Orphaned payments**: a paid-but-unconfirmed payment (callback dropped, server
   restarted) has no recovery path other than manual intervention.

## Decision

### 1. `transitionToVerifying` — atomic first-writer-wins claim

A new function `transitionToVerifying(paymentId)` in `payment-service.ts` issues:

```sql
UPDATE "Payment"
SET status = 'verifying'
WHERE id = $paymentId AND status = 'pending'
```

The conditional `WHERE status = 'pending'` is the lock. Only one concurrent caller
can change 0→1 rows. The second caller sees 0 and takes the idempotent early-return
path. This eliminates the double-apply race.

The callback route (`/api/payments/callback`) now calls `transitionToVerifying` before
`provider.verify()`, failing fast if 0 rows were updated.

`PaymentStatus` enum gains a `verifying` value (migration 0005).

### 2. `recordPaymentRefunded` — succeeded → refunded transition

A new `recordPaymentRefunded(paymentId)` function guards the transition with
`WHERE status = 'succeeded'` so only verified payments can be refunded.

### 3. `ceiling-split.ts` — per-transaction ceiling handler

`splitIntoSubCharges(amount, ceiling)` splits a BigInt amount into N chunks of at most
`ceiling` rial each, with the last chunk taking the remainder.

`computeCeilingSplit({ amount, tipAmount, ceiling })` splits the full gateway total
(amount + tip) by the ceiling and distributes the bill/tip portions proportionally
across chunks. This ensures each `gatewayTotal` (chunk.amount + chunk.tipAmount) stays
at or below the ceiling.

`areCeilingSplitSubChargesFullyPaid(subCharges)` returns true only when every
sub-charge has `status=succeeded`. The order is not marked paid until this is true.

`IPG_TRANSACTION_CEILING_RIAL` is the default ceiling constant (50 000 000 rial).
**This MUST be re-verified against the chosen facilitator's live API docs before
production use (PRD §6.1 load-bearing caveat).**

### 4. `reconciliation-sweep.ts` — scheduled orphan resolver

`runReconciliationSweep(input)` takes a list of stale payments and a `PaymentProvider`,
calls `provider.inquire(trackId)` for each, and dispatches to one of four callbacks:

| Inquiry result | Action |
|---|---|
| `succeeded` | `onVerified` — auto-complete the payment |
| `failed` | `onFailed` — mark failed, release reservation |
| `pending` + past expiry | `onAmbiguous` — surface to ops queue |
| `pending` + not expired | `onAmbiguous` — surface to ops queue |
| no trackId | `onExpired` — cannot inquire, expire |

The sweep is decoupled from the DB and gateway via dependency injection — the
callbacks do the DB writes so the sweep logic is independently testable without
Postgres or a live gateway.

`buildReconciliationSweepRunner()` returns a configured runner for scheduled-job use.

`SWEEP_STALENESS_MINUTES = 10` is the staleness threshold.

### 5. `POST /api/payments/sweep` — scheduled sweep endpoint

The sweep endpoint fetches all `pending/verifying` payments older than
`SWEEP_STALENESS_MINUTES` and runs `runReconciliationSweep`. It requires a
`x-sweep-secret` header matching `SWEEP_SECRET` env when the secret is set.

### 6. Migration 0005 — `verifying` enum value

```sql
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'verifying' AFTER 'pending';
```

## State machine (final)

```
[*] → pending           (initiatePaymentLeg)
pending → verifying     (transitionToVerifying — first-writer-wins atomic claim)
verifying → succeeded   (recordPaymentVerified — verify=paid)
verifying → failed      (recordPaymentFailed — verify=failed)
verifying → succeeded   (recordPaymentVerified — "already processed", idempotent)
pending/verifying → expired (expirePayment — TTL + sweep)
succeeded → refunded    (recordPaymentRefunded — payout unwind)
```

## Round 2 — blocking items resolved

### 1. Ceiling-split wired into live payment-initiation path

`POST /api/payments/route.ts` now calls `computeCeilingSplit` before sending to
the gateway. When `requiresSplit=true`, it calls `initiateSubChargeLegs` (new
function in `orders.ts`) which creates one `Payment` row per chunk within a single
DB transaction, each with a unique `idempotencyKey` and shared `parentPaymentId`
group key (`csg_*`). The first sub-charge is sent to the gateway immediately.

### 2. Sweep loop-abort bug fixed

`reconciliation-sweep.ts` line ~101: the ambiguous past-expiry branch used `return`
(aborting the entire loop). Changed to `continue` so a single ambiguous payment does
not halt the rest of the sweep batch.

### 3. Ops queue is now durable

`OpsQueueEntry` table added to `prisma/schema.prisma` with migration
`0006_ops_queue_table`. The sweep route writes ambiguous payments to this table
instead of an in-memory array. Superadmin queries the table; the cron response
body is irrelevant.

### 4. Integration tests test the shipped code

`tests/payment-service-integration.test.ts` (new) tests the actual `payment-service.ts`
functions via `vi.mock('@/lib/db')` — same pattern as `server-authoritative-pricing.test.ts`.
Covers: double-callback, refresh, already-processed, overpay, abandon, ceiling-split
sub-charge accumulation.

### 5. Overpay surplus-refund in live verify path

`recordPaymentVerified` now checks `order.amountPaid >= order.total` BEFORE
crediting. When the order is already fully paid, the incoming payment is immediately
transitioned to `refunded` in the same transaction and `overpaid: true` is returned.
No credit to `amountPaid` occurs. This handles the cross-gateway double-settlement
race from day one (PRD §5.4.2).

## Consequences

- Concurrent callbacks and reconciliation sweeps cannot double-apply any transition.
- Bills exceeding the ceiling are split into sub-charges via `initiateSubChargeLegs`;
  the order is paid only when all sub-charges verify (amountPaid accumulation).
- Orphaned pending/verifying payments older than 10 minutes are resolved automatically.
- Ambiguous payments are written to the durable `OpsQueueEntry` table for ops review.
- Overpay surplus payments are auto-refunded in the `recordPaymentVerified` verify path.
- A single ambiguous payment no longer aborts the entire sweep cycle.
- All acceptance criteria for issue #21 are covered by both test files.

## Files introduced/modified

| File | Change |
|---|---|
| `src/lib/payment/payment-service.ts` | `transitionToVerifying`, `recordPaymentRefunded`; `recordPaymentVerified` overpay guard |
| `src/lib/payment/ceiling-split.ts` | `splitIntoSubCharges`, `computeCeilingSplit`, `areCeilingSplitSubChargesFullyPaid` |
| `src/lib/payment/reconciliation-sweep.ts` | `runReconciliationSweep` (`continue` fix), `buildReconciliationSweepRunner` |
| `src/lib/payment/index.ts` | Re-exports |
| `src/lib/orders.ts` | `initiateSubChargeLegs` — ceiling-split DB writes |
| `src/app/api/payments/route.ts` | Ceiling-split check before provider.request(); calls `initiateSubChargeLegs` |
| `src/app/api/payments/callback/route.ts` | `transitionToVerifying` before `provider.verify()` |
| `src/app/api/payments/sweep/route.ts` | Durable `OpsQueueEntry` writes; no in-memory opsQueue |
| `prisma/schema.prisma` | `verifying` enum; `OpsQueueEntry` model |
| `prisma/migrations/0005_payment_status_verifying/migration.sql` | `verifying` enum addition |
| `prisma/migrations/0006_ops_queue_table/migration.sql` | `OpsQueueEntry` table |
| `tests/payment-state-machine.test.ts` | Added loop-abort regression test (10b) |
| `tests/payment-service-integration.test.ts` | New: 18 tests against real functions via vi.mock |
| `docs/payments/state-machine-ceiling-split-reconciliation.md` | Updated docs |
