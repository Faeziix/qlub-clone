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

If any price has changed between the client's cart view and order creation, `createOrderFromCart` returns `priceChanged: true`. The `/api/orders` route surfaces this flag. The caller is responsible for showing a "price updated" notice to the diner before redirecting to payment.

The payment then verifies against the server-side snapshot, never the client.

### 3. `$transaction` wrapping

`createOrderFromCart`, `recordPayment`, and `initiatePaymentLeg` all execute inside `db.$transaction`. The `vendorOrderSeq` increment inside `nextVendorOrderNumber` is now passed the transaction client so the entire order creation — including the sequence increment, `Order.create`, and `DiningTable.update` — is atomic.

`recordPayment` wraps the order read, payment create, and order update in a single transaction, preventing concurrent writes from creating duplicate payments or incorrect `amountPaid` totals.

### 4. Split leg reservation (`initiatePaymentLeg`)

A new exported function `initiatePaymentLeg` creates a `Payment` with `status: "pending"` and an `expiresAt` TTL (15 minutes) before the diner is redirected to the gateway. The function accounts for already-reserved pending legs when computing the remaining balance, preventing cross-gateway double-settlement.

### 5. Idempotency

`recordPayment` and `initiatePaymentLeg` accept an optional `idempotencyKey`. Before writing, they query `payment.findUnique({ where: { idempotencyKey } })`. If a matching payment exists, it is returned immediately without a second write, and `idempotent: true` is set in the result. The `Payment.idempotencyKey` column is `@unique` in the schema (already established in M2 schema migration).

## Consequences

- **Positive**: Client cart tampering can no longer affect the bill. Concurrent split payments are safe. Gateway redirects can be safely retried. Price changes are surfaced to the diner.
- **Positive**: `initiatePaymentLeg` prepares the system for the full `PaymentProvider` gateway integration in Phase 4 (issue #20).
- **Neutral**: `createOrderFromCart` return type changed from `Order` to `{ order, priceChanged }`. One caller (`/api/orders/route.ts`) updated.
- **Neutral**: Each `createOrderFromCart` call makes N+1 DB queries (one per item + one per modifier option). Acceptable for correctness; can be optimized with a batch fetch later.
- **Future**: `initiatePaymentLeg` currently creates a `pending` payment. In Phase 4, it will also call `PaymentProvider.request()` and attach the `trackId` from the gateway response before returning the redirect URL.
