# ADR-0006: Server-Authoritative Pricing, Honored-Price Rule, Concurrency, and Idempotency

- **Status**: Accepted (revised round 2 — 2026-06-26)
- **Date**: 2026-06-25
- **Issue**: #9

## Context

The previous `createOrderFromCart` implementation trusted client-supplied `unitPrice` and `priceDelta` verbatim. This is exploitable: a malicious client can send price=1 for a 100,000 rial item. Additionally, `recordPayment` was not transactional and had no idempotency, creating double-settlement and duplicate-payment risks.

Round 2 review identified three blocking correctness bugs:

1. **Broken split-bill**: `validatePaymentLegsAgainstSnapshot` used `paidTotal >= snapshotTotal` as its validity condition, which rejects every partial split leg (e.g., the first leg of a 3-way even split pays ≈33% — below the total, so `valid=false` — causing `recordPayment` to throw on every split payment).
2. **FOR UPDATE was dead code**: `initiatePayment` had a row-lock comment but `$queryRaw … FOR UPDATE` was never issued; `recordPayment` had no lock at all. Two concurrent sessions could read the same balance and both pass the `remaining` check.
3. **initiatePayment was unreachable**: The live API route called `recordPayment` directly; `initiatePayment` had zero callers, so the leg-reservation + TTL protection was never exercised on the real path.

## Decisions

### 1. Server-authoritative pricing

`createOrderFromCart` now:
1. Fetches current `MenuItem.price` and `ModifierOption.priceDelta` from the DB by ID, scoped to `vendorId` at every level (item + modifier option via `group.item.vendorId`).
2. Computes the bill using those DB prices (`computeServerBill`), ignoring client-supplied amounts entirely.
3. Snapshots the authoritative `unitPrice` onto each `OrderItem` at creation time.
4. Client-supplied `unitPrice` values are accepted only for routing (to identify which item), never for computation.
5. Item names are fetched from the DB and passed into `detectPriceChanges` so the notice shows readable names, not raw IDs.

### 2. Honored-price rule

If DB prices differ from the cart at order-creation time:
- The order is created with the current (authoritative) DB prices.
- A `priceChanges` list carrying `itemName`/`optionName` is returned to the caller.
- The CartSheet UI surfaces a notice ("قیمت‌ها تغییر کرده‌اند") before proceeding to payment, using semantic design tokens (`bg-warning-soft text-warning`) not hardcoded Tailwind color classes.
- The user can confirm (proceed with new prices) or cancel.

### 3. The honored-price invariant — corrected semantics

`validatePaymentLegsAgainstSnapshot` (in `pricing-authority.ts`) is the P0 invariant:
- Input: the pre-computed `order.total` from the snapshot + all payment legs.
- Assertion: `sum(leg.amount) <= order.total` — cumulative legs must NOT exceed the snapshot (tips excluded, tracked separately on `Payment.tipAmount`).
- **Violation = overpayment only** (`paidTotal > snapshotTotal`). A single partial leg (`paidTotal < snapshotTotal`) is VALID — the order is not yet fully settled, not corrupt.
- `isFullyPaid(amountPaid, total)` from `money.ts` is the separate "fully paid" check used to decide order closure.
- Both `initiatePayment` and `recordPayment` also enforce `input.amount <= remaining` (remaining = total − already-settled). This catches the overpayment before it reaches the invariant.

### 4. Concurrency — FOR UPDATE + split leg reservation

Both `initiatePayment` and `recordPayment` now issue a real row-level lock inside the `$transaction`:

```sql
SELECT id FROM "Order" WHERE id = $orderId FOR UPDATE
```

This is expressed via `tx.$queryRaw` (Prisma ORM has no first-class `FOR UPDATE` syntax for single-row locking). With `READ COMMITTED` (Postgres default), the `FOR UPDATE` forces a second concurrent transaction to block on the lock, ensuring the `remaining` check is serialised.

`initiatePayment`:
- Computes `remaining = order.total − (succeededLegs + activeReservedLegs)`.
- Rejects if `input.amount > remaining` to prevent cross-gateway double-settlement.
- Sets `Payment.expiresAt = now + 15 min` (TTL) on the pending leg, reserving it before any gateway redirect.
- The reconciliation sweep (Phase 4) releases expired legs.

`recordPayment`:
- Computes `remaining = order.total − succeededLegs` (expired/failed pending legs are not counted).
- Rejects if `input.amount > remaining`.
- Validates the overpayment invariant.
- Creates the `succeeded` payment row and updates `Order.amountPaid` atomically.

### 5. Idempotency keys

- `Payment.idempotencyKey String? @unique` in the schema.
- `initiatePayment` requires an idempotency key; `recordPayment` accepts an optional one.
- Duplicate submission returns the existing payment row (`deduplicated: true`).
- `buildIdempotencyKey(orderId, payerId, splitLegId)` provides a deterministic server-side key.
- `PaymentFlow.tsx` generates a `nanoid(32)` client nonce per payment session and sends it as `idempotencyKey`, wiring the dedup on the live path.

### 6. `$transaction` wrapping

Both `initiatePayment` and `recordPayment`:
- Run inside `db.$transaction(...)`.
- Issue `SELECT … FOR UPDATE` on the order row before reading payments.
- Re-fetch the order and its payments inside the transaction for consistent reads.
- Run the remaining-balance check, then the invariant check, before writing any row.
- Update `Order.amountPaid` and status atomically with the payment creation.

## Trade-offs

- `FOR UPDATE` is issued via `$queryRaw`, which bypasses Prisma's type system for that one statement. This is the only safe way to issue a row-level lock in Prisma ORM today; alternatives (advisory locks, explicit transaction isolation level) are heavier or require separate infra.
- The `remaining` check + `FOR UPDATE` serialisation is sufficient to prevent the cross-gateway double-settlement scenario without requiring SERIALIZABLE isolation, which would increase deadlock risk under high concurrency.
- SQLite `db push` was sufficient for development but the schema now points to Postgres (Neon). The provider switch from `sqlite` to `postgresql` was made alongside this issue since `.env.local` already pointed to Neon.
- No Prisma migrations directory yet — the project still uses `db push`. This is a known M2 milestone gap tracked separately; it does not affect the correctness of this issue's changes.

## Files changed

Round 1 (2026-06-25):
- `prisma/schema.prisma` — added `idempotencyKey`, `trackId`, `gatewayReference`, `expiresAt`, `verifiedAt`, `parentPaymentId` to `Payment`; switched provider to `postgresql` with `directUrl`.
- `src/lib/pricing-authority.ts` — new module: `computeServerBill`, `detectPriceChanges`, `validatePaymentLegsAgainstSnapshot`, `buildIdempotencyKey`.
- `src/lib/orders.ts` — rewrote `createOrderFromCart` to be server-authoritative; added `initiatePayment`; rewrote `recordPayment` with transaction + idempotency + invariant check.
- `src/app/api/orders/route.ts` — returns `priceChanges` alongside `order`.
- `src/app/api/payments/route.ts` — accepts optional `idempotencyKey`.
- `src/components/customer/CartSheet.tsx` — surfaces price-changed notice.
- `src/lib/__tests__/server-authoritative-pricing.test.ts` — 23 new tests.

Round 2 (2026-06-26) — blocking items resolved:
- `src/lib/pricing-authority.ts` — corrected `validatePaymentLegsAgainstSnapshot` invariant (`<=` not `>=`); added `itemName`/`optionName` to `PriceChangeNotice`; `detectPriceChanges` now carries human-readable names.
- `src/lib/orders.ts` — added `SELECT … FOR UPDATE` via `$queryRaw` in both `initiatePayment` and `recordPayment`; fixed invariant call in `recordPayment` (was erroneously checking `>=`); scoped modifier option fetch to `group.item.vendorId`; added remaining-balance check to `recordPayment`.
- `src/components/customer/CartSheet.tsx` — `PriceChangedNotice` replaced hardcoded `bg-amber-100 text-amber-600` with semantic `bg-warning-soft text-warning` tokens; shows `itemName`/`optionName` instead of raw DB IDs.
- `src/components/customer/PaymentFlow.tsx` — generates `nanoid(32)` client nonce per session, sends as `idempotencyKey` on every payment POST, wiring live-path dedup.
- `src/app/globals.css` + `tailwind.config.ts` — added `--warning-soft` CSS variable and `warning.soft` / `success.soft` Tailwind tokens.
- `src/lib/__tests__/server-authoritative-pricing.test.ts` — rewrote invariant tests to assert correct semantics; added integration-style `recordPayment`-path simulation tests (7 new cases); added property-based test for individual-leg validity.
