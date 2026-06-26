# ADR-0021: PaymentProvider Interface + Simulated/Sandbox Facilitator

**Issue**: #20 · **Milestone**: M6 — Payments & Settlement · **Status**: Accepted

---

## Context

The system needs to integrate with Iranian payment gateways (IPG / Shaparak facilitators).
Before the concrete live facilitator is chosen (issue #5), the payment abstraction must be
in place so the rest of the application — order flow, state machine, reconciliation sweep,
and tests — can be built against a stable interface.

The PRD (§6.2) specifies a `PaymentProvider` interface and requires:
- The active adapter to be env-selected (`PAYMENT_PROVIDER`)
- A simulated/sandbox adapter to be the default, enabling tests/build without external accounts
- Server-side `verify()` to be the ONLY authoritative source of payment status
- Redirect success params to never be trusted for money decisions

## Decision

### 1. `PaymentProvider` interface (`src/lib/payment/provider.ts`)

All seven methods are defined:
- `request(input)` — creates a gateway session; returns `{ ref }`
- `redirectUrl(ref)` — returns the browser redirect URL (no status in URL)
- `verify(ref)` — **SERVER-SIDE only**, authoritative; idempotent
- `inquire(ref)` — status API for the reconciliation sweep
- `refundViaPayout(input)` — wallet-funded payout (not card-rail reversal)
- `onboardSubMerchant(input)` — sub-merchant KYC registration
- `verifyIban(input)` — CBI IBAN ownership verification

All money values are integer rial (`BigInt`); conversion to gateway-expected units is the
adapter's responsibility using boundaries defined in `money.ts`.

### 2. `SimulatedPaymentAdapter` (`src/lib/payment/adapters/simulated.ts`)

Fully in-process; no external dependency. Stores sessions in a `Map`. Implements the
complete IPG cycle including idempotent `verify()` and `inquire()` for reconciliation.

Test-only helpers (`simulatePaid`, `simulateCancelled`, `getSessionForTest`) allow tests
to drive the gateway's hosted-payment-page behavior without any HTTP.

The redirect URL contains the `ref` only — no status, amount, or refNumber. This enforces
the contract that `verify()` must be called server-side.

### 3. Provider factory (`src/lib/payment/factory.ts`)

`getPaymentProvider()` reads `PAYMENT_PROVIDER` and returns the matching adapter.
Defaults to `SimulatedPaymentAdapter` when unset or set to `"simulated"` / `"sandbox"`.
Throws on unknown values to surface misconfiguration early.

### 4. Callback route (`src/app/api/payments/callback/route.ts`)

The gateway browser-redirects here after the diner pays or cancels. The handler:
1. Reads `paymentId` from the URL (set by us when building `callbackUrl`)
2. Loads the `Payment` record to retrieve `trackId` (the gateway ref) and `tipAmount`
3. Calls `provider.verify(trackId)` — the ONLY authoritative path
4. Asserts `verifyResult.amount === payment.amount + payment.tipAmount` (PRD §6.4 amount guard); treats a mismatch as a failure
5. Calls `recordPaymentVerified(amount: payment.amount)` — credits only the bill portion into `order.amountPaid`; or `recordPaymentFailed` on error
6. Redirects the browser to `/payment/success`, `/payment/failed`, or `/payment/pending`

The gateway's callback query-string params (`status`, `amount`, `refNumber`) are explicitly
ignored — only `provider.verify()` counts.

### 4a. Tip inclusion in the IPG charge (PRD §6.4)

`POST /api/payments` passes `leg.total` (= `amount + tipAmount`) to `provider.request()`
so the gateway charges the full amount the diner owes. Only `leg.amount` (the bill portion)
is credited into `order.amountPaid` via `recordPaymentVerified`, consistent with the cash
path convention where tip is tracked as a separate field on the payment leg.

The `mobile` field is omitted from `provider.request()` since the current request schema
has no diner-mobile field. A future issue may add E.164 mobile collection.

### 5. Payment state machine service (`src/lib/payment/payment-service.ts`)

`recordPaymentVerified` uses a conditional `UPDATE WHERE status IN ('pending','verifying')`
so concurrent callbacks or sweep runs cannot double-apply. The first writer wins.

## Consequences

- The app, build, and full test suite run with zero external accounts (`PAYMENT_PROVIDER`
  unset → simulated default).
- Adding a live facilitator adapter (issue #5) requires: a concrete class implementing
  `PaymentProvider`, a new case in the factory switch, and re-verification of all API field
  names, result codes, and ceilings against the live facilitator's current docs (PRD §6.1
  load-bearing caveat).
- The interface is backward-compatible: adding new adapters does not break existing callers.

## Files introduced

| File | Purpose |
|---|---|
| `src/lib/payment/provider.ts` | `PaymentProvider` interface + all input/result types |
| `src/lib/payment/adapters/simulated.ts` | In-process sandbox adapter |
| `src/lib/payment/factory.ts` | `getPaymentProvider()` factory |
| `src/lib/payment/index.ts` | Re-exports |
| `src/lib/payment/payment-service.ts` | State machine transitions (verify/fail/expire) |
| `src/app/api/payments/callback/route.ts` | Gateway callback handler (server-side verify) |
| `tests/payment-provider.test.ts` | 39 tests covering all acceptance criteria |
