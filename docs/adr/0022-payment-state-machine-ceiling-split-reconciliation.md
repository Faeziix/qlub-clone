# ADR-0022: Payment State Machine + Idempotency + Reconciliation Sweep + Ceiling-Split

**Issue**: #21 · **Milestone**: M6 — Payments & Settlement · **Status**: Accepted

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

## Consequences

- Concurrent callbacks and reconciliation sweeps cannot double-apply any transition.
- Bills exceeding the ceiling can be processed via sub-charges.
- Orphaned pending/verifying payments older than 10 minutes are resolved automatically.
- Ambiguous payments (still pending at gateway past expiry) are surfaced to an ops queue.
- All acceptance criteria for issue #21 are covered by `tests/payment-state-machine.test.ts`.

## Files introduced/modified

| File | Change |
|---|---|
| `src/lib/payment/payment-service.ts` | `transitionToVerifying`, `recordPaymentRefunded`; updated `expirePayment` to guard verifying too |
| `src/lib/payment/ceiling-split.ts` | New: `splitIntoSubCharges`, `computeCeilingSplit`, `areCeilingSplitSubChargesFullyPaid` |
| `src/lib/payment/reconciliation-sweep.ts` | New: `runReconciliationSweep`, `buildReconciliationSweepRunner`, types |
| `src/lib/payment/index.ts` | Updated re-exports |
| `src/app/api/payments/callback/route.ts` | Uses `transitionToVerifying` before `provider.verify()` |
| `src/app/api/payments/sweep/route.ts` | New: scheduled reconciliation sweep endpoint |
| `prisma/schema.prisma` | Added `verifying` to `PaymentStatus` enum |
| `prisma/migrations/0005_payment_status_verifying/migration.sql` | Enum value addition |
| `tests/payment-state-machine.test.ts` | New: 44 tests covering all acceptance criteria |
| `docs/adr/0022-payment-state-machine-ceiling-split-reconciliation.md` | This document |
| `docs/payments/state-machine-ceiling-split-reconciliation.md` | Updated payment docs |
