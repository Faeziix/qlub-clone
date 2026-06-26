# Refund-as-Payout + Platform-Wallet Ledger + Overpayment Unwind

**Issue**: #23 · **Milestone**: M6 — Payments & Settlement · **ADR**: [0023](../adr/0023-refund-as-payout-wallet-ledger-overpayment-unwind.md)

---

## Overview

Refunds in this platform are **wallet-funded payouts**, never card-rail reversals.
This document describes the platform settlement wallet, the float guard, and the
overpayment unwind path (PRD §6.6).

---

## Platform Wallet

A singleton `PlatformWallet` row holds the current `balanceRial` (integer rial,
BigInt). Before any refund can be issued, the wallet must be pre-funded by the
platform operator via `depositFloat()`.

```
Initial state: no wallet exists (balance = 0)
After first deposit: PlatformWallet { balanceRial: 10_000_000 }
After refund of 500_000: PlatformWallet { balanceRial: 9_500_000 }
```

The float source is a named business prerequisite (founder capital / operating
account); see PRD §15.

---

## Wallet Ledger (WalletTransaction)

Every debit and credit to the wallet is recorded as an append-only
`WalletTransaction` row:

| Type            | Description |
|-----------------|-------------|
| `deposit`       | Operator pre-funds the wallet |
| `refund_payout` | A refund payout issued to a diner |

Each `refund_payout` row carries:
- `paymentId` — the original `Payment` being refunded
- `payoutRef` — the reference returned by `provider.refundViaPayout()`
- `destinationIban` — the beneficiary IBAN the payout was sent to
- `amountRial` — the refund amount in integer rial

The invariant `walletBalance = Σ(deposits) − Σ(refund_payouts)` is enforced
by writing both the balance update and the ledger entry in one DB transaction.

---

## Refund Flow

```
1. Operator triggers refund for paymentId X with amountRial Y
2. Call provider.refundViaPayout({ paymentRef, amount, destinationIban })
   → payoutRef returned
3. Call issueRefundAsPayout({ paymentId, amountRial, destinationIban, payoutRef })
   a. Load PlatformWallet (inside $transaction)
   b. Float guard: if walletBalance < amountRial → return INSUFFICIENT_FLOAT
   c. Atomic decrement: UPDATE ... SET balanceRial = balanceRial - amount WHERE balanceRial >= amount RETURNING balanceRial
   d. Append WalletTransaction(type=refund_payout, paymentId, payoutRef, destinationIban)
   e. UPDATE Payment SET status='refunded' WHERE status='succeeded'
4. Return { success: true, payoutRef, newBalanceRial }
```

Steps 3a–3e are atomic. The ledger is written only after the gateway call succeeds.

---

## Float Guard and Concurrency Safety (AC2)

The wallet row is locked with `SELECT ... FOR UPDATE` before the balance check,
preventing the read-check-write race under Postgres READ COMMITTED. After the
lock, the balance is decremented atomically using a conditional UPDATE:

```sql
UPDATE "PlatformWallet"
SET "balanceRial" = "balanceRial" - $amount
WHERE id = $id AND "balanceRial" >= $amount
RETURNING "balanceRial"
```

If 0 rows are returned (concurrent drain between lock acquisition and this
update), `INSUFFICIENT_FLOAT` is returned without writing a ledger entry or
touching `Payment.status`. No refund can overdraw the wallet.

No payout is issued, no wallet entry is written, and `Payment.status` is not
changed if the wallet lacks sufficient float.

---

## Overpayment / Double-Settlement Unwind (AC3)

When `recordPaymentVerified` detects that an order was already fully paid (the
cross-gateway race from PRD §5.4.2), it writes:

```
OpsQueueEntry { reason: 'overpay_pending_payout_unwind', paymentId, orderId, vendorId }
```

The operator resolves this via `resolveOverpaymentViaRefund()`, which:
1. Verifies the payment exists.
2. Delegates to `issueRefundAsPayout` — the **exact same path** as a regular refund.

There is no separate overpayment refund mechanism; AC3 is satisfied by reuse.

---

## Error Responses

`issueRefundAsPayout` returns a typed discriminated union — no exceptions for
business-rule failures:

| Error code           | Cause |
|----------------------|-------|
| `NO_WALLET`          | Platform wallet has never been created / funded |
| `INSUFFICIENT_FLOAT` | `walletBalance < refundAmount` |
| `ZERO_AMOUNT`        | `amountRial ≤ 0` |
| `PAYMENT_NOT_FOUND`  | (`resolveOverpaymentViaRefund` only) payment record missing |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/payment/wallet-service.ts` | Core wallet service |
| `prisma/schema.prisma` | `PlatformWallet`, `WalletTransaction`, `WalletTransactionType` |
| `prisma/migrations/0007_platform_wallet_ledger/` | DB migration |
| `tests/wallet-refund-ledger.test.ts` | 20 tests covering all acceptance criteria including concurrency |
| `prisma/migrations/0008_wallet_txn_destination_iban/` | Adds `destinationIban` column to `WalletTransaction` |

---

## What is NOT in scope (v1)

- Real-money payout execution against a live facilitator — env-gated, pending #5.
- Beneficiary clawback (recovering already-settled merchant funds) — reconciled
  out-of-band, per PRD §6.6.
- Multi-currency or per-tenant wallets.
- Card-rail reversals — explicitly excluded by PRD design.
