# PaymentProvider Interface & Sandbox Facilitator

**Issue**: #20 · **Milestone**: M6 — Payments & Settlement · **ADR**: [0021](../adr/0021-payment-provider-interface-simulated-adapter.md)

---

## Overview

The `PaymentProvider` interface (`src/lib/payment/provider.ts`) is the single abstraction
over all Iranian payment facilitators (IPG / Shaparak پرداخت‌یار). Every concrete adapter
implements this interface. The active adapter is selected by `PAYMENT_PROVIDER` at runtime.

## The standard Iranian IPG cycle

```
request() → redirectUrl() → [browser pays on gateway] → callback → verify() → inquire()
```

1. **request** — the server creates a gateway session. The amount is in integer rial.
2. **redirectUrl** — the browser navigates to this URL (the gateway's hosted payment page).
3. **[diner pays]** — off-process; the gateway hosts this.
4. **callback** — the gateway redirects the browser to `/api/payments/callback`.
5. **verify** — **server-side only, non-negotiable**. The ONLY authoritative status source.
6. **inquire** — the reconciliation sweep polls this for orphaned pending payments.

## Server-side verify is non-negotiable

> **NEVER trust the redirect query-string params for payment status or amount.**

The gateway sends `?status=ok&amount=500000` in the callback URL. These are for UI hints
only — not for money decisions. The server MUST call `provider.verify(trackId)` to get the
authoritative result.

This rule is enforced in the implementation:
- `SimulatedPaymentAdapter.redirectUrl()` does not embed status or amount in the URL.
- `GET /api/payments/callback` ignores all gateway query params and calls `provider.verify()`.
- Tests assert that a tampered redirect does not bypass server verify.

## Methods

### `request(input: PaymentRequestInput): Promise<{ ref: string }>`

Creates a pending payment session. `ref` (= trackId / authority depending on facilitator)
is stored on `Payment.trackId`.

Required fields: `merchantId`, `amount` (integer rial), `callbackUrl`, `orderId`.
Optional: `description`, `mobile`, `multiplexingInfos` (split legs for تسهیم).

### `redirectUrl(ref: string): string`

Returns the URL the browser should navigate to. Must NOT contain authoritative status.

### `verify(ref: string): Promise<PaymentVerifyResult>`

Server-side. Returns `{ status, amount?, refNumber? }`. Idempotent — safe to call multiple
times for the same ref (reconciliation sweep calls this).

Status values: `"succeeded"` | `"failed"` | `"pending"`.

### `inquire(ref: string): Promise<PaymentInquireResult>`

Lightweight status poll used by the reconciliation sweep. Returns `{ status, amount? }`.

### `refundViaPayout(input): Promise<RefundViaPayoutResult>`

Issues a wallet-funded payout to a diner IBAN. Not a card-rail reversal (PRD §6.6).
Returns `{ payoutRef, status }`.

### `onboardSubMerchant(input): Promise<{ subMerchantId }>`

Registers a restaurant as a payment sub-merchant under the facilitator. Called during
owner onboarding (gated by eNamad + business license). Stores result on
`Vendor.gatewaySubMerchantId`.

### `verifyIban(input): Promise<{ verified, holderName? }>`

CBI IBAN ownership verification. Required before enabling payouts to a restaurant.

## Selecting the active adapter

| `PAYMENT_PROVIDER` env | Adapter |
|---|---|
| unset | `SimulatedPaymentAdapter` (default) |
| `simulated` | `SimulatedPaymentAdapter` |
| `sandbox` | `SimulatedPaymentAdapter` |
| (live adapter) | Added under issue #5 |

When unset, the simulated adapter is used — no gateway account required for dev, CI,
or staging.

## SimulatedPaymentAdapter

The sandbox adapter stores sessions in an in-process `Map`. It is used by default and
powers all tests.

**Test helpers** (do not use outside tests):
- `simulatePaid(ref)` — mimics the diner completing payment on the gateway's hosted page
- `simulateCancelled(ref)` — mimics the diner cancelling
- `getSessionForTest(ref)` — raw session access for assertions

## Adding a live facilitator adapter (issue #5)

1. Create `src/lib/payment/adapters/<name>.ts` implementing `PaymentProvider`.
2. Add a case to `getPaymentProvider()` in `src/lib/payment/factory.ts`.
3. **Re-verify ALL field names, result codes, multiplexing shapes, and ceilings** against
   the chosen facilitator's current live API docs. The PRD §6.1 caution applies: every
   numeric/field detail in the plan is synthesis-level and MUST be checked.
4. Write integration tests against the verified contract.
5. Never add to `.env.example` until the facilitator onboarding (issue #5) is complete.

## Money discipline

All amounts in `PaymentProvider` are integer rial (`BigInt`). The adapter converts to
the gateway's expected unit at the boundary using `rialForGateway` / `rialFromGateway`
from `money.ts`. A wrong ×10 or ×1000 silently over/undercharges — the property-based
tests in `tests/money.test.ts` guard this.

## Callback route

`GET /api/payments/callback` implements the verify-first contract:
1. Reads `paymentId` from the URL query (set by us when building the `callbackUrl`).
2. Loads `Payment.trackId` from the DB.
3. Calls `provider.verify(trackId)` — ignores all gateway query params.
4. Calls `recordPaymentVerified` or `recordPaymentFailed` with the verified result.
5. Redirects the browser to `/payment/success` or `/payment/failed`.
