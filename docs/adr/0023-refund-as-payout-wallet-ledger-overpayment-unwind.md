# ADR-0023: Refund-as-Payout + Platform-Wallet Ledger + Overpayment Unwind

**Issue**: #23 · **Milestone**: M6 — Payments & Settlement · **Status**: Accepted

---

## Context

Issue #23 implements PRD §6.6 (Refunds & overpayment unwind). The prior payment
state machine (ADR-0022 / issue #21) introduced `PaymentStatus=refunded` and
`recordPaymentRefunded()`, but the mechanism that drives that transition — the
platform wallet — was not yet built.

Three gaps existed:

1. **No wallet model**: nowhere to ledger the platform's pre-funded float.
2. **No float guard**: refunds could theoretically be issued without checking
   whether funds were available, violating the "no refund exceeding available float"
   contract.
3. **No payout ledger**: there was no append-only record tying each
   `PaymentStatus=refunded` transition to a specific wallet debit, making the
   balance unauditable.

The overpayment/double-settlement path (already handled in `recordPaymentVerified`
via `OpsQueueEntry(reason=overpay_pending_payout_unwind)`) also needed a resolution
path that reuses the same wallet mechanism.

---

## Decision

### 1. Schema: `PlatformWallet` + `WalletTransaction`

Two new models (migration `0007_platform_wallet_ledger`):

```
PlatformWallet   — singleton row; holds current balanceRial (BigInt integer rial)
WalletTransaction — append-only ledger row; type ∈ { deposit, refund_payout }
                    references walletId, optional paymentId + payoutRef
```

The `balanceRial` column on `PlatformWallet` is the computed live balance.
The `WalletTransaction` table is the source of truth for the audit log.
The invariant `balanceRial = Σ(deposit.amountRial) − Σ(refund_payout.amountRial)`
is enforced by always writing both the balance update and the ledger entry inside
the same DB transaction.

A `WalletTransactionType` enum enforces the allowed entry types at the DB level.

### 2. `wallet-service.ts` — the float-guarded refund service

Three public operations:

**`issueRefundAsPayout(input)`** — the core refund path (AC1, AC2):
1. Load `PlatformWallet`.
2. Float guard: `walletBalance < refundAmount → INSUFFICIENT_FLOAT` (AC2).
3. Decrement `walletBalance` by `amountRial`.
4. Append `WalletTransaction(type=refund_payout)` with `paymentId` + `payoutRef`.
5. Conditional-UPDATE `Payment.status = 'refunded' WHERE status = 'succeeded'`.

All five steps execute inside a single `db.$transaction()`. The caller supplies the
`payoutRef` obtained by calling `provider.refundViaPayout()` BEFORE entering this
function — the ledger is written only after the gateway call succeeds.

**`depositFloat(input)`** — operator pre-funds the wallet:
Creates the singleton `PlatformWallet` on first deposit; increments the balance
on subsequent deposits. Appends `WalletTransaction(type=deposit)`.

**`resolveOverpaymentViaRefund(input)`** — AC3 path:
Validates the payment exists, then delegates to `issueRefundAsPayout`. The
overpayment case reuses the identical code path — there is no separate refund
mechanism (AC3).

Helper reads: `getWalletBalance()` and `getWalletLedger()` for the settlement view.

### 3. Refund errors are domain values, not exceptions

`RefundResult` is a discriminated union:

```ts
type RefundResult =
  | { success: true; payoutRef: string; newBalanceRial: bigint }
  | { success: false; error: "NO_WALLET" | "INSUFFICIENT_FLOAT" | "ZERO_AMOUNT" | "PAYMENT_NOT_FOUND" }
```

The caller does not need to try/catch for business-rule failures; only DB
infrastructure errors bubble as exceptions.

### 4. No card-rail reversals — ever

`refundViaPayout()` on the `PaymentProvider` interface was already present (ADR-0021).
The wallet service calls it to obtain a `payoutRef`, then ledgers the result.
The payment's `status` is set to `refunded` ONLY via the wallet transaction — not via
any other code path. `recordPaymentRefunded()` in `payment-service.ts` remains the
SQL guard for that transition but is now called exclusively by `issueRefundAsPayout`.

---

## Consequences

**Positive**
- Every refund is ledgered with a `payoutRef` and `paymentId`, making the wallet
  fully auditable at all times (AC4).
- Float guard prevents refunds from exceeding available funds (AC2).
- Overpayment unwind reuses the exact same code path (AC3) — no parallel refund logic.
- `PaymentStatus=refunded` is driven exclusively by a payout record, never by a
  gateway reversal (AC1).
- Domain errors surface as typed values, not exceptions, improving callsite safety.

**Constraints / not changed**
- The actual gateway call (`provider.refundViaPayout()`) remains the caller's
  responsibility before entering `issueRefundAsPayout`. This is intentional:
  the ledger records only confirmed gateway payouts.
- The real-money payout execution against a live facilitator remains env-gated
  (pending issue #5 / provider selection). All wallet/ledger/refund logic and tests
  run against the `SimulatedPaymentAdapter` in CI without any external account.
- Beneficiary clawback (recovering already-settled merchant funds) is reconciled
  out-of-band against future settlements or B2B invoice, per PRD §6.6. This ADR
  does not change that policy.
- The `PlatformWallet` is a singleton (one global wallet). Multi-currency or
  per-tenant wallets are out of scope for v1.

---

## Migration

`0007_platform_wallet_ledger` adds `PlatformWallet`, `WalletTransaction`, and
the `WalletTransactionType` enum. No existing tables are altered.

The wallet must be pre-funded via `depositFloat()` before any refund can be issued.
The initial float source is a named business prerequisite (founder capital /
operating account) tracked in PRD §15.

---

## Related

- ADR-0022 — Payment state machine (introduced `PaymentStatus=refunded`, `recordPaymentRefunded`)
- ADR-0021 — PaymentProvider interface (`refundViaPayout` method)
- PRD §6.6 — Refunds & overpayment unwind
- Issue #21 — OpsQueueEntry(reason=overpay_pending_payout_unwind) feeds AC3
