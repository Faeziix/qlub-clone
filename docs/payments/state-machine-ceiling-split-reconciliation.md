# Payment State Machine, Ceiling-Split & Reconciliation Sweep

**Issue**: #21 · **Milestone**: M6 — Payments & Settlement · **ADR**: [0022](../adr/0022-payment-state-machine-ceiling-split-reconciliation.md)

---

## Payment State Machine

Every payment in the system follows a strict state machine. All transitions are
guarded by conditional updates (`WHERE status = <expected>`) so concurrent
callbacks and reconciliation sweeps converge to the same terminal state.

```
[*] → pending
pending → verifying     (transitionToVerifying)
verifying → succeeded   (recordPaymentVerified — verify=paid)
verifying → failed      (recordPaymentFailed — verify=failed)
pending/verifying → expired (expirePayment + sweep)
succeeded → refunded    (recordPaymentRefunded — payout unwind or overpay)
```

### The `verifying` state — first-writer-wins

When a gateway callback arrives at `/api/payments/callback`, the handler calls
`transitionToVerifying(paymentId)` before calling `provider.verify()`. This
issues a conditional `UPDATE WHERE status='pending'` — only the first caller
succeeds (1 row updated). Any concurrent callback sees 0 rows updated and returns
the idempotent early-response path. This prevents double-crediting.

### Double-callback safety

The sequence is:
1. Callback A arrives → `transitionToVerifying` → 1 row updated → claim success
2. Callback B arrives (concurrent/retry) → `transitionToVerifying` → 0 rows → early return
3. Callback A calls `provider.verify()` → `recordPaymentVerified`

Even if A and B call `recordPaymentVerified` concurrently, the
`WHERE status IN ('pending','verifying')` guard on that function means only the
first writer applies the credit.

### Overpay — surplus-refund (PRD §5.4.2)

`recordPaymentVerified` detects when `order.amountPaid >= order.total` BEFORE
crediting the incoming payment. In that case, the order is already fully paid by
a prior leg. The surplus payment is immediately transitioned to `refunded` status
and is NOT credited to `order.amountPaid`. This handles the cross-gateway
double-settlement race from day one.

Return value is now `{ fullyPaid, idempotent, overpaid }`. Callers must check
`overpaid` and surface it for payout unwind.

---

## Ceiling-Split Handler

Iranian IPG gateways enforce per-transaction ceilings (Shaparak). High table bills
or bills with large tips can exceed the ceiling and must be split into multiple
sub-charges.

### `IPG_TRANSACTION_CEILING_RIAL`

The default ceiling is `50_000_000n` rial (50 000 000 rial). **Re-verify this
constant against the chosen facilitator's live API docs before production use.**

### `splitIntoSubCharges(amount, ceiling)`

Splits an integer rial amount into N chunks of at most `ceiling` rial each. The
last chunk takes the remainder. Throws for zero/negative inputs.

### `computeCeilingSplit({ amount, tipAmount, ceiling })`

Splits the gateway total (amount + tip) by the ceiling and distributes bill/tip
portions proportionally. Each chunk's `gatewayTotal` stays at or below ceiling.

Returns `{ requiresSplit: boolean, chunks: SubChargeChunk[] }` where each chunk
has `{ amount, tipAmount, gatewayTotal }`.

### Order paid only when ALL sub-charges verify

Each sub-charge is a separate `Payment` row linked via `parentPaymentId` (a
synthetic group key `csg_*`). Because `recordPaymentVerified` increments
`order.amountPaid` by `chunk.amount` on each sub-charge callback, the order only
reaches `amountPaid >= total` (and transitions to `paid`) after every sub-charge
has verified. No explicit "all verified?" check is needed — the amountPaid
accumulation enforces it.

### `POST /api/payments` — ceiling-split initiation

When `computeCeilingSplit` returns `requiresSplit=true`, the payment initiation
endpoint calls `initiateSubChargeLegs` which creates one `Payment` row per chunk
within a single transaction. The first sub-charge is sent to the gateway immediately;
remaining sub-charges are returned in `remainingSubCharges` for the client to
process sequentially after each prior sub-charge succeeds.

---

## Reconciliation Sweep

The sweep is the real safety net (PRD §6.7): "Zero paid-but-unconfirmed orders
left unresolved > 30 min."

### `runReconciliationSweep(input)`

Takes a list of stale payments and a `PaymentProvider`. For each payment:

| `provider.inquire()` result | Action |
|---|---|
| `succeeded` | `onVerified(paymentId, orderId, amount, ref)` |
| `failed` | `onFailed(paymentId)` |
| `pending` | `onAmbiguous(entry)` — write to durable `OpsQueueEntry` table |
| no trackId | `onExpired(paymentId)` |

**Loop contract**: each payment is processed with `continue`, never `return`.
An ambiguous or error condition on one payment does not abort processing of
subsequent payments in the batch.

All DB writes happen in the callbacks supplied by the caller — the sweep logic
itself has no side effects so it is independently testable.

### Durable ops queue — `OpsQueueEntry` table

Ambiguous payments are written to the `OpsQueueEntry` table (not an in-memory
array). This ensures a scheduled cron's discarded HTTP response does not lose
the ambiguous payment record. Superadmin queries this table to review and
manually resolve ambiguous payments, filtered by `vendorId` and `resolvedAt IS NULL`.

Schema: `{ id, paymentId, orderId, vendorId, reason, resolvedAt, inquiredAt, createdAt }`

### `POST /api/payments/sweep`

The scheduled sweep endpoint:
- Requires `x-sweep-secret` header (if `SWEEP_SECRET` env is set)
- **SWEEP_SECRET MUST be set in production** — without it the endpoint is open to any caller, enabling gateway quota drain
- Fetches all `pending/verifying` payments older than `SWEEP_STALENESS_MINUTES` (10 min)
- Runs `runReconciliationSweep`
- Returns `{ ok, swept, resolved: { verified, failed, expired, ambiguous } }`

**Schedule**: run every 5 minutes.

### Staleness threshold

`SWEEP_STALENESS_MINUTES = 10`. A payment is swept if it was created more than 10
minutes ago and is still in `pending` or `verifying` status.

---

## Files

| File | Purpose |
|---|---|
| `src/lib/payment/payment-service.ts` | State machine transitions + overpay detection |
| `src/lib/payment/ceiling-split.ts` | Ceiling-split math (pure, no DB) |
| `src/lib/payment/reconciliation-sweep.ts` | Sweep logic + types (pure, no DB) |
| `src/lib/orders.ts` | `initiateSubChargeLegs` — creates ceiling-split Payment rows |
| `src/app/api/payments/route.ts` | Wires ceiling-split into payment initiation |
| `src/app/api/payments/callback/route.ts` | Callback handler with `transitionToVerifying` |
| `src/app/api/payments/sweep/route.ts` | Scheduled sweep endpoint (durable ops queue) |
| `prisma/schema.prisma` | `OpsQueueEntry` model |
| `prisma/migrations/0005_payment_status_verifying/` | `verifying` enum addition |
| `prisma/migrations/0006_ops_queue_table/` | `OpsQueueEntry` table |
| `tests/payment-state-machine.test.ts` | State machine + sweep + ceiling-split (fake DB) |
| `tests/payment-service-integration.test.ts` | Real function tests via vi.mock (AC1, AC4) |
