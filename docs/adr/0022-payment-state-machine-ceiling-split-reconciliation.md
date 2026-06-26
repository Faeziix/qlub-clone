# ADR-0022: Payment State Machine + Idempotency + Reconciliation Sweep + Ceiling-Split

**Issue**: #21 · **Milestone**: M6 — Payments & Settlement · **Status**: Accepted (Round 3 — blocking items resolved)

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

### 5. Overpay surplus-refund in live verify path (PRD §5.4.2, §6.6)

`recordPaymentVerified` now checks `order.amountPaid >= order.total` BEFORE
crediting. When the order is already fully paid, the incoming payment remains
`succeeded` in the DB and an `OpsQueueEntry` is created with
`reason='overpay_pending_payout_unwind'`. `overpaid: true` is returned to the
caller. No credit to `amountPaid` occurs.

The status is NOT set to `refunded` here. Per PRD §6.6, `status='refunded'` is
only written by `recordPaymentRefunded()`, which the operator calls AFTER a
payout record has been created and confirmed. The previous design wrote `refunded`
directly, which violated §6.6 ("PaymentStatus=refunded must be driven by a payout
record, never by a direct set") and left the gateway-captured money silently kept
without any surfaced action required of the operator.

## Round 3 — blocking items resolved

### 1. Sub-charge continuation path — `POST /api/payments/next-sub-charge`

Prior to Round 3, only the first sub-charge (leg 0) in a ceiling-split group ever
received a gateway session. Sub-charges 1..N-1 were created with `trackId=null`
and the reconciliation sweep would route them to `onExpired`, permanently
abandoning them. The order could never reach `amountPaid >= total` for any bill
requiring a split.

`POST /api/payments/next-sub-charge` is a new route the client calls after each
sub-charge's callback returns success. It:
1. Validates that `completedPaymentId` belongs to `parentPaymentId` and is `succeeded`.
2. Finds the next `pending` sub-charge in the group (ordered by `createdAt`).
3. Requests a gateway session for it (`provider.request`), stores `trackId`, and
   returns `{ gatewayRedirectUrl, trackId }`.
4. If all sub-charges are already `succeeded`, returns `{ done: true }`.
5. If a `trackId` is already set (concurrent/retry), returns the existing redirect
   URL idempotently without re-requesting.

This makes the ceiling-split flow an end-to-end completable path for the first time.

### 2. Overpay queues to ops, not directly `refunded`

See "Overpay surplus-refund" above (corrected from Round 2). The `recordPaymentVerified`
function no longer issues `UPDATE Payment SET status='refunded'` directly. Instead it
creates an `OpsQueueEntry` with `reason='overpay_pending_payout_unwind'` so the
superadmin operator can issue a refund-as-payout before the status is marked refunded.

### 3. Full ceiling-split flow test coverage — `tests/payment-ceiling-split-flow.test.ts`

New test file covering the end-to-end multi-sub-charge flow:
- Full 2-sub-charge flow: leg-1 callback → verified → `next-sub-charge` continuation → leg-2 callback → verified → order paid (AC2)
- Partial failure: leg-1 succeeds, leg-2 fails → order stays unpaid
- Sweep catches leg-2-still-pending and resolves it via inquiry
- Overpay race: concurrent second verify on a fully-paid order queues to ops, does not double-credit

The FakeDatabase harness mirrors `payment-state-machine.test.ts`. A note in the file
documents the Postgres row-lock integration test that is gated behind `DIRECT_URL`
availability in the test environment (Phase 5 domestic cutover).

### 4. Sweep `onVerified` passes `vendorId`

`ReconciliationSweepCallbacks.onVerified` signature extended to include `vendorId`
so the sweep route can pass it through to `recordPaymentVerified`, enabling correct
OpsQueueEntry attribution in the overpay path.

### 5. Callback route — amount-mismatch goes to ops, not `recordPaymentFailed`

If the gateway confirms success but the verified amount != reserved total, the
previous code called `recordPaymentFailed`, silently abandoning a payment the
gateway had already captured. The callback now writes an `OpsQueueEntry` with
`reason='amount_mismatch:reserved=N,verified=M'` and redirects to pending.

### 6. Sweep auth warning when `SWEEP_SECRET` unset

The sweep route now emits a `console.warn` when `SWEEP_SECRET` is not set, making
the open-endpoint risk visible in logs. The production runbook MUST set this env var.

### 7. Tips credited in IPG verify path

`recordPaymentVerified` now accepts an optional `tipAmount` parameter and increments
`order.tipAmount` alongside `order.amountPaid`. Previously, only `recordPayment`
(cash path) credited the tip, leaving `order.tipAmount=0` for IPG-paid orders with tips.

### 8. Stale reconciliation-sweep module docstring corrected

The module docstring incorrectly described `expiresAt passed → onExpired`. The code
routes that case to `onAmbiguous`. The docstring now matches the code.

## Consequences

- Concurrent callbacks and reconciliation sweeps cannot double-apply any transition.
- Bills exceeding the ceiling are split into sub-charges via `initiateSubChargeLegs`;
  the client drives each successive leg via `POST /api/payments/next-sub-charge`;
  the order is paid only when all sub-charges verify (amountPaid accumulation).
- Orphaned pending/verifying payments older than 10 minutes are resolved automatically.
- Ambiguous payments are written to the durable `OpsQueueEntry` table for ops review.
- Overpay surplus payments queue to ops for operator-driven payout unwind, not auto-refunded.
  `status='refunded'` is only written by `recordPaymentRefunded()` after a payout record exists.
- A single ambiguous payment no longer aborts the entire sweep cycle.
- Amount-mismatch on verify surfaces to ops instead of silently failing a captured payment.
- All acceptance criteria for issue #21 are covered by three test files.

## Files introduced/modified

| File | Change |
|---|---|
| `src/lib/payment/payment-service.ts` | Overpay queues to ops (not direct `refunded`); tipAmount increment; vendorId param |
| `src/lib/payment/ceiling-split.ts` | (unchanged) |
| `src/lib/payment/reconciliation-sweep.ts` | `onVerified` callback adds `vendorId` param; docstring corrected |
| `src/lib/payment/index.ts` | Re-exports |
| `src/lib/orders.ts` | `initiateSubChargeLegs` — ceiling-split DB writes |
| `src/app/api/payments/route.ts` | Ceiling-split check before provider.request(); calls `initiateSubChargeLegs` |
| `src/app/api/payments/callback/route.ts` | Amount-mismatch → ops queue; tip credited; vendorId passed |
| `src/app/api/payments/sweep/route.ts` | Passes vendorId to `onVerified`; warns when SWEEP_SECRET unset |
| `src/app/api/payments/next-sub-charge/route.ts` | NEW: continuation endpoint for ceiling-split legs 2..N |
| `prisma/schema.prisma` | `verifying` enum; `OpsQueueEntry` model |
| `prisma/migrations/0005_payment_status_verifying/migration.sql` | `verifying` enum addition |
| `prisma/migrations/0006_ops_queue_table/migration.sql` | `OpsQueueEntry` table |
| `tests/payment-state-machine.test.ts` | (unchanged from Round 2) |
| `tests/payment-service-integration.test.ts` | Updated overpay test: asserts ops queue entry not direct `refunded` |
| `tests/payment-ceiling-split-flow.test.ts` | NEW: full multi-sub-charge end-to-end flow tests |
| `docs/payments/state-machine-ceiling-split-reconciliation.md` | Updated docs |
