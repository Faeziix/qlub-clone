# ADR-0009: Server-Authoritative Pricing, Honored-Price Rule, Concurrency & Idempotency

- **Status**: Accepted
- **Date**: 2026-06-26
- **Issue**: #9
- **Milestone**: M2 — Data & Money Core

---

## Context

The original implementation of `createOrderFromCart` accepted `unitPrice` and `priceDelta` from the client cart and used them directly to compute the bill and snapshot onto `OrderItem`. This allowed a malicious client to send `unitPrice: 1n` and pay almost nothing.

`recordPayment` wrote a `Payment` row without checking for duplicate submissions (no idempotency) and without a database transaction, creating a race condition in split-bill scenarios.

## Decision

### 1. Server-authoritative pricing

`createOrderFromCart` now re-fetches `MenuItem.price` and `ModifierOption.priceDelta` by primary key from the database before computing the bill. Client-supplied money values are ignored for pricing. The DB price is snapshotted onto `OrderItem.unitPrice` at order creation time.

### 2. Honored-price rule

If any price has changed between the client's cart view and order creation, `createOrderFromCart` returns `priceChanged: true`. The `/api/orders` route surfaces this flag. `CartSheet.tsx` consumes `priceChanged` from the response and gates the redirect: when `true` it renders an interstitial screen with the updated total, an `AlertTriangle` icon, and two buttons — "Confirm and pay" (proceeds to `/pay`) and "Go back" (clears the gate). No redirect occurs until the diner explicitly confirms.

The payment then verifies against the server-side snapshot, never the client.

### 3. `$transaction` + `SELECT … FOR UPDATE`

`createOrderFromCart`, `recordPayment`, and `initiatePaymentLeg` all execute inside `db.$transaction`. Price resolution (`resolveLinePricesInsideTx`) runs inside the same transaction, eliminating the TOCTOU gap between resolving prices and creating the order.

`recordPayment` and `initiatePaymentLeg` use `tx.$queryRaw\`SELECT … FOR UPDATE\`` on the `Order` row before computing remaining balance. This acquires a PostgreSQL row-level exclusive lock, preventing concurrent split payers from reading the same `amountPaid` / reserved balance and both passing the remaining-balance check.

### 4. Split leg reservation (`initiatePaymentLeg`) wired into the payment route

`initiatePaymentLeg` is now called by `POST /api/payments` for every payment request (replacing the previous direct call to `recordPayment`). This ensures every gateway redirect is preceded by a reservation. The function:
- Locks the `Order` row with `FOR UPDATE`
- Reads active pending legs with `status = 'pending' AND expiresAt > NOW()`
- Subtracts the reserved balance from the remaining calculation
- Creates the pending payment with a 15-minute `expiresAt` TTL

### 5. Idempotency — race-safe dedup inside transaction

`recordPayment` and `initiatePaymentLeg` dedup inside the transaction using `$queryRaw SELECT id FROM "Payment" WHERE idempotencyKey = $1`. This avoids the check-then-create race of separate `findUnique + create` calls; any concurrent request with the same key will block on the transaction rather than creating a duplicate row.

`POST /api/payments` auto-generates a server-side `idempotencyKey` (`pay_<nanoid(21)>`) when none is supplied by the client, ensuring idempotency is always wired on the live path.

### 6. Tenant-isolation + no client-trust fallback

`resolveLinePricesInsideTx` issues a single `menuItem.findMany({ where: { id: { in: itemIds }, vendorId } })` and `modifierOption.findMany({ where: { id: { in: optionIds }, group: { item: { vendorId } } } })`. If any item or modifier option is not found for the vendor it throws immediately — there is no fallback to the client-supplied price. This prevents both cross-tenant item attachment and deleted-item client-price trust.

## Consequences

- **Positive**: Client cart tampering can no longer affect the bill. Concurrent split payments are safe. Gateway redirects can be safely retried. Price changes are surfaced to the diner.
- **Positive**: `initiatePaymentLeg` prepares the system for the full `PaymentProvider` gateway integration in Phase 4 (issue #20).
- **Neutral**: `createOrderFromCart` return type changed from `Order` to `{ order, priceChanged }`. One caller (`/api/orders/route.ts`) updated.
- **Neutral**: Each `createOrderFromCart` call makes N+1 DB queries (one per item + one per modifier option). Acceptable for correctness; can be optimized with a batch fetch later.
- **Future**: `initiatePaymentLeg` currently creates a `pending` payment. In Phase 4, it will also call `PaymentProvider.request()` and attach the `trackId` from the gateway response before returning the redirect URL.
