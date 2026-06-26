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
succeeded → refunded    (recordPaymentRefunded — payout unwind)
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

`areCeilingSplitSubChargesFullyPaid(subCharges)` returns `true` only when every
sub-charge has `status=succeeded`. The order must not be marked paid until this
is true. Each sub-charge is a separate `Payment` row linked via `parentPaymentId`.

### `POST /api/payments` — ceiling-split initiation

When `computeCeilingSplit` returns `requiresSplit=true`, the payment initiation
endpoint creates one `Payment` row per chunk and calls `provider.request()` for
each sub-charge sequentially. Each sub-charge has its own `idempotencyKey` derived
from the parent leg's key.

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
| `pending` | `onAmbiguous(entry)` — surface to ops queue |
| no trackId | `onExpired(paymentId)` |

All DB writes happen in the callbacks supplied by the caller — the sweep logic
itself has no side effects so it is independently testable.

### `POST /api/payments/sweep`

The scheduled sweep endpoint:
- Requires `x-sweep-secret` header (if `SWEEP_SECRET` env is set)
- Fetches all `pending/verifying` payments older than `SWEEP_STALENESS_MINUTES` (10 min)
- Runs `runReconciliationSweep`
- Returns `{ ok, swept, resolved: { verified, failed, expired, ambiguous }, opsQueue }`

**Schedule**: run every 5 minutes. Set `SWEEP_SECRET` to a strong random value.

### Staleness threshold

`SWEEP_STALENESS_MINUTES = 10`. A payment is swept if it was created more than 10
minutes ago and is still in `pending` or `verifying` status. This gives the gateway
and callback handler adequate time to complete normally before the sweep intervenes.

### Ops queue

Ambiguous payments (gateway still returns `pending` past the payment's TTL) are
surfaced in the `opsQueue` array of the sweep response. A superadmin must manually
inspect and resolve these — they typically indicate a gateway issue or a payment
in limbo that requires manual investigation.

---

## Files

| File | Purpose |
|---|---|
| `src/lib/payment/payment-service.ts` | State machine transitions |
| `src/lib/payment/ceiling-split.ts` | Ceiling-split logic |
| `src/lib/payment/reconciliation-sweep.ts` | Sweep logic + types |
| `src/app/api/payments/callback/route.ts` | Callback handler with `transitionToVerifying` |
| `src/app/api/payments/sweep/route.ts` | Scheduled sweep endpoint |
| `prisma/migrations/0005_payment_status_verifying/` | `verifying` enum addition |
