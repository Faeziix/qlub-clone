# ADR-0006: Server-Authoritative Pricing, Honored-Price Rule, Concurrency, and Idempotency

- **Status**: Accepted
- **Date**: 2026-06-25
- **Issue**: #9

## Context

The previous `createOrderFromCart` implementation trusted client-supplied `unitPrice` and `priceDelta` verbatim. This is exploitable: a malicious client can send price=1 for a 100,000 rial item. Additionally, `recordPayment` was not transactional and had no idempotency, creating double-settlement and duplicate-payment risks.

## Decisions

### 1. Server-authoritative pricing

`createOrderFromCart` now:
1. Fetches current `MenuItem.price` and `ModifierOption.priceDelta` from the DB by ID, scoped to the vendor.
2. Computes the bill using those DB prices (`computeServerBill`), ignoring client-supplied amounts entirely.
3. Snapshots the authoritative `unitPrice` onto each `OrderItem` at creation time.
4. Client-supplied `unitPrice` values are accepted only for routing (to identify which item), never for computation.

### 2. Honored-price rule

If DB prices differ from the cart at order-creation time:
- The order is created with the current (authoritative) DB prices.
- A `priceChanges` list is returned to the caller.
- The CartSheet UI surfaces a notice ("قیمت‌ها تغییر کرده‌اند") before proceeding to payment.
- The user can confirm (proceed with new prices) or cancel.

### 3. The honored-price invariant

`validatePaymentLegsAgainstSnapshot` (in `pricing-authority.ts`) is the P0 invariant:
- Input: the pre-computed `order.total` from the snapshot + all payment legs.
- Assertion: `sum(leg.amount) >= order.total` (tips excluded — tracked separately).
- This is called in `initiatePayment` and `recordPayment` before any money is written.

### 4. Concurrency — split leg reservation

`initiatePayment` acquires the order inside a `$transaction` and reserves a split leg:
- Computes `remaining = order.total - (succeededLegs + activeReservedLegs)`.
- Rejects if `input.amount > remaining` to prevent cross-gateway double-settlement.
- Sets `Payment.expiresAt = now + 15 min` (TTL) on the pending leg.
- The reconciliation sweep (Phase 4) releases expired legs.

### 5. Idempotency keys

- `Payment.idempotencyKey String? @unique` added to the schema.
- `initiatePayment` and `recordPayment` both check for an existing payment with the same key before creating a new one.
- Duplicate submission returns the existing payment row (`deduplicated: true`).
- `buildIdempotencyKey(orderId, payerId, splitLegId)` provides a deterministic server-side key.

### 6. `$transaction` wrapping

`recordPayment` now:
- Runs inside `db.$transaction(...)`.
- Re-fetches the order and its payments inside the transaction for consistent reads.
- Runs the invariant check before writing the payment row.
- Updates `Order.amountPaid` and status atomically with the payment creation.

## Trade-offs

- SQLite `db push` was sufficient for development but the schema now points to Postgres (Neon). The provider switch from `sqlite` to `postgresql` was made alongside this issue since `.env.local` already pointed to Neon.
- `FOR UPDATE` row-locking is not directly expressible in Prisma ORM. The protection here is via transaction isolation (Postgres `REPEATABLE READ` default for `$transaction`) + the `remaining` check inside the transaction. A future Phase 4 implementation can add raw SQL `SELECT ... FOR UPDATE` via `db.$queryRaw` for the order row if the facilitator integration requires stricter locking.

## Files changed

- `prisma/schema.prisma` — added `idempotencyKey`, `trackId`, `gatewayReference`, `expiresAt`, `verifiedAt`, `parentPaymentId` to `Payment`; switched provider to `postgresql` with `directUrl`.
- `src/lib/pricing-authority.ts` — new module: `computeServerBill`, `detectPriceChanges`, `validatePaymentLegsAgainstSnapshot`, `buildIdempotencyKey`.
- `src/lib/orders.ts` — rewrote `createOrderFromCart` to be server-authoritative; added `initiatePayment`; rewrote `recordPayment` with transaction + idempotency + invariant check.
- `src/app/api/orders/route.ts` — returns `priceChanges` alongside `order`.
- `src/app/api/payments/route.ts` — accepts optional `idempotencyKey`.
- `src/components/customer/CartSheet.tsx` — surfaces price-changed notice.
- `src/lib/__tests__/server-authoritative-pricing.test.ts` — 23 new tests.
