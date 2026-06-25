# Server-Authoritative Pricing, Honored-Price Rule, Concurrency & Idempotency

**Issue**: #9 · **Milestone**: M2 — Data & Money Core · **ADR**: referenced below

---

## Problem

The original `createOrderFromCart` trusted client-supplied `unitPrice` and `priceDelta` values directly. A tampered cart could undercharge by setting `unitPrice: 1n`. Payment recording was also non-transactional and had no idempotency.

## Solution

### 1. Server-authoritative pricing

`createOrderFromCart` now re-fetches every `MenuItem.price` and `ModifierOption.priceDelta` from the database by ID before computing the bill. Client-supplied values are used only for cart metadata (name, imageUrl, notes) — never for money.

- `resolveLinePricesFromDb(lines)` resolves DB prices for all items and modifier options.
- `detectPriceChange(original, resolved)` compares resolved prices to client values.
- The bill is computed from `resolvedLines` using `computeBill`.
- `OrderItem.unitPrice` is snapshotted from the DB price, not the client.

### 2. Honored-price rule

When prices have changed between menu view and checkout:
- `createOrderFromCart` returns `{ order, priceChanged: boolean }`.
- `order.priceChanged` is also set on the returned order object.
- The API route (`POST /api/orders`) surfaces `priceChanged` in the response.
- The UI must show a "price updated" notice and prompt re-confirmation before payment.

### 3. Transactional writes with FOR UPDATE

`createOrderFromCart` executes inside `db.$transaction`. The `nextVendorOrderNumber` function accepts a transaction client (`tx`) to ensure the `vendorOrderSeq` increment is atomic.

`recordPayment` and `initiatePaymentLeg` both execute inside `db.$transaction`. This prevents concurrent split payments from double-recording or overpaying.

### 4. Split leg reservation (`initiatePaymentLeg`)

Before redirecting a diner to the payment gateway, `initiatePaymentLeg` reserves the split leg:
- Reads the order inside a transaction.
- Subtracts already-reserved pending payments (within TTL) from the remaining balance.
- Creates a `Payment` record with `status: "pending"` and `expiresAt` (15-minute TTL).
- Returns the pending payment for the gateway redirect.

If `remaining <= 0` the order is already paid or reserved; the function throws.

### 5. Idempotency keys

`recordPayment` and `initiatePaymentLeg` both accept an optional `idempotencyKey`.

- Before any write, `db.payment.findUnique({ where: { idempotencyKey } })` is called.
- If a matching payment exists, it is returned immediately with `idempotent: true` — no second write.
- The `idempotencyKey` is stored on the `Payment` record (`@unique` in schema).
- The gateway redirect key should be a client-generated stable ID (e.g. `nanoid`).

### 6. Invariant: legs reconcile to snapshot

The honored-price invariant is enforced by construction:
- `order.total` = computed from DB prices at creation time, snapshotted.
- `Payment.amount` legs sum to `order.total` (enforced by `initiatePaymentLeg` remaining check).
- `Payment.tipAmount` is tracked separately and does not inflate `order.total`.
- The full invariant is tested in `tests/server-authoritative-pricing.test.ts`.

---

## API changes

### `createOrderFromCart` return type

Before: `Promise<Order & { items: ...; vendor: ...; table: ... }>`

After: `Promise<{ order: Order & { priceChanged: boolean; ... }; priceChanged: boolean }>`

**Callers must destructure**: `const { order, priceChanged } = await createOrderFromCart(...)`.

### New export: `initiatePaymentLeg`

```ts
initiatePaymentLeg({
  orderId: string;
  amount: bigint;
  tipAmount: bigint;
  method: PaymentMethod;
  idempotencyKey: string;
  splitType?: SplitType;
  splitMeta?: Record<string, unknown> | null;
  payerName?: string;
  payerEmail?: string;
}): Promise<Payment>
```

Creates a `status: "pending"` payment leg reserved for 15 minutes. Throws if the order is already fully paid or the requested amount exceeds the remaining balance.

### `recordPayment` additions

- New optional field: `idempotencyKey?: string`
- Returns `{ payment, fullyPaid, amountPaid, idempotent: boolean }` (note: `idempotent` is new).

---

## Test coverage

`tests/server-authoritative-pricing.test.ts` covers:
1. Client-supplied `unitPrice` is ignored; DB price is used.
2. Client-supplied modifier `priceDelta` is ignored; DB delta is used.
3. `priceChanged: false` when all prices match.
4. Bill computation uses DB prices.
5. `priceChanged: true` when prices differ.
6. `createOrderFromCart` executes inside a `$transaction`.
7. `recordPayment` executes inside a `$transaction`.
8. `initiatePaymentLeg` reserves the leg atomically.
9. Idempotent re-submission returns the existing payment.
10. New `idempotencyKey` creates a new payment.
11. `idempotencyKey` is stored on the payment record.
12. Payment amount equals order total (no tip).
13. Tip does not inflate `order.total`.
14. Multi-item `lineTotal` sum equals `subtotal`.
15. `payment.total` = `amount + tip`.
16. Even-split legs sum to `order.total` with no rounding leak.
17. Legs sum reconciles to `OrderItem` snapshot total.
18. `initiatePaymentLeg` creates a pending payment with future `expiresAt`.
19. `initiatePaymentLeg` throws when balance is already exhausted.
20. `$transaction` is called for `initiatePaymentLeg`.
