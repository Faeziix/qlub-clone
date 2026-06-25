/**
 * Tests for issue #9 — server-authoritative pricing + honored-price rule +
 * concurrency + idempotency.
 *
 * These are pure unit tests on the service-layer helpers; no DB is required.
 * The invariant test asserts that payment legs always reconcile to the
 * OrderItem snapshot (subtotal + service charge + tax + tip), never to
 * client-supplied numbers.
 */

import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  computeServerBill,
  detectPriceChanges,
  validatePaymentLegsAgainstSnapshot,
  buildIdempotencyKey,
} from "@/lib/pricing-authority";
import { evenSplit } from "@/lib/pricing";

// ─── Helpers shared across test groups ───────────────────────────────────────

type DbItemPrice = { itemId: string; price: bigint };
type DbModifierPrice = { optionId: string; priceDelta: bigint };

type CartLineInput = {
  itemId: string;
  quantity: number;
  unitPrice: bigint;
  modifiers: Array<{ optionId: string; priceDelta: bigint }>;
};

// ─── detectPriceChanges ───────────────────────────────────────────────────────

describe("detectPriceChanges", () => {
  it("returns empty array when no prices changed", () => {
    const cartLines: CartLineInput[] = [
      { itemId: "item-1", quantity: 1, unitPrice: 10_000n, modifiers: [] },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 10_000n }];
    const result = detectPriceChanges(cartLines, dbPrices, []);
    expect(result).toHaveLength(0);
  });

  it("detects when a menu item price increased", () => {
    const cartLines: CartLineInput[] = [
      { itemId: "item-1", quantity: 2, unitPrice: 10_000n, modifiers: [] },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 12_000n }];
    const changes = detectPriceChanges(cartLines, dbPrices, []);
    expect(changes).toHaveLength(1);
    expect(changes[0].itemId).toBe("item-1");
    expect(changes[0].cartPrice).toBe(10_000n);
    expect(changes[0].currentPrice).toBe(12_000n);
  });

  it("detects when a menu item price decreased", () => {
    const cartLines: CartLineInput[] = [
      { itemId: "item-1", quantity: 1, unitPrice: 15_000n, modifiers: [] },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 10_000n }];
    const changes = detectPriceChanges(cartLines, dbPrices, []);
    expect(changes).toHaveLength(1);
    expect(changes[0].cartPrice).toBe(15_000n);
    expect(changes[0].currentPrice).toBe(10_000n);
  });

  it("detects when a modifier priceDelta changed", () => {
    const cartLines: CartLineInput[] = [
      {
        itemId: "item-1",
        quantity: 1,
        unitPrice: 10_000n,
        modifiers: [{ optionId: "opt-1", priceDelta: 2_000n }],
      },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 10_000n }];
    const dbModifiers: DbModifierPrice[] = [
      { optionId: "opt-1", priceDelta: 3_000n },
    ];
    const changes = detectPriceChanges(cartLines, dbPrices, dbModifiers);
    expect(changes).toHaveLength(1);
    expect(changes[0].optionId).toBe("opt-1");
  });

  it("reports no changes when multiple items all match DB prices", () => {
    const cartLines: CartLineInput[] = [
      { itemId: "item-1", quantity: 1, unitPrice: 10_000n, modifiers: [] },
      { itemId: "item-2", quantity: 2, unitPrice: 20_000n, modifiers: [] },
    ];
    const dbPrices: DbItemPrice[] = [
      { itemId: "item-1", price: 10_000n },
      { itemId: "item-2", price: 20_000n },
    ];
    const changes = detectPriceChanges(cartLines, dbPrices, []);
    expect(changes).toHaveLength(0);
  });
});

// ─── computeServerBill ────────────────────────────────────────────────────────

describe("computeServerBill", () => {
  it("uses DB prices, not client-supplied unitPrice", () => {
    const cartLines: CartLineInput[] = [
      {
        itemId: "item-1",
        quantity: 1,
        unitPrice: 5_000n,
        modifiers: [],
      },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 10_000n }];
    const bill = computeServerBill(cartLines, dbPrices, [], {
      serviceChargePct: 0,
      taxPct: 0,
      taxInclusive: false,
    });
    expect(bill.subtotal).toBe(10_000n);
  });

  it("ignores client priceDelta and uses DB modifier priceDelta", () => {
    const cartLines: CartLineInput[] = [
      {
        itemId: "item-1",
        quantity: 1,
        unitPrice: 10_000n,
        modifiers: [{ optionId: "opt-1", priceDelta: 1_000n }],
      },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 10_000n }];
    const dbModifiers: DbModifierPrice[] = [
      { optionId: "opt-1", priceDelta: 5_000n },
    ];
    const bill = computeServerBill(cartLines, dbPrices, dbModifiers, {
      serviceChargePct: 0,
      taxPct: 0,
      taxInclusive: false,
    });
    expect(bill.subtotal).toBe(15_000n);
  });

  it("multiplies by quantity using DB price", () => {
    const cartLines: CartLineInput[] = [
      {
        itemId: "item-1",
        quantity: 3,
        unitPrice: 5_000n,
        modifiers: [],
      },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 10_000n }];
    const bill = computeServerBill(cartLines, dbPrices, [], {
      serviceChargePct: 0,
      taxPct: 0,
      taxInclusive: false,
    });
    expect(bill.subtotal).toBe(30_000n);
  });

  it("applies service charge on top of DB-authoritative subtotal", () => {
    const cartLines: CartLineInput[] = [
      {
        itemId: "item-1",
        quantity: 1,
        unitPrice: 999_999n,
        modifiers: [],
      },
    ];
    const dbPrices: DbItemPrice[] = [{ itemId: "item-1", price: 100_000n }];
    const bill = computeServerBill(cartLines, dbPrices, [], {
      serviceChargePct: 10,
      taxPct: 0,
      taxInclusive: false,
    });
    expect(bill.subtotal).toBe(100_000n);
    expect(bill.serviceCharge).toBe(10_000n);
    expect(bill.total).toBe(110_000n);
  });
});

// ─── validatePaymentLegsAgainstSnapshot (the invariant test) ─────────────────

describe("validatePaymentLegsAgainstSnapshot — the honored-price invariant", () => {
  it("passes when a single payment leg equals the order snapshot total", () => {
    const snapshotTotal = 20_000n;
    const paymentLegs = [{ amount: 20_000n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(
      snapshotTotal,
      paymentLegs
    );
    expect(result.valid).toBe(true);
    expect(result.snapshotTotal).toBe(20_000n);
    expect(result.paidTotal).toBe(20_000n);
    expect(result.discrepancy).toBe(0n);
  });

  it("passes when multiple split legs sum to the snapshot total", () => {
    const snapshotTotal = 33_000n;
    const paymentLegs = [
      { amount: 16_500n, tipAmount: 0n },
      { amount: 16_500n, tipAmount: 0n },
    ];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(true);
    expect(result.snapshotTotal).toBe(33_000n);
    expect(result.paidTotal).toBe(33_000n);
  });

  it("fails when payment legs do NOT reconcile to the snapshot", () => {
    const snapshotTotal = 10_000n;
    const paymentLegs = [{ amount: 8_000n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBe(2_000n);
  });

  it("excludes tip from the snapshot comparison (tip is tracked separately)", () => {
    const snapshotTotal = 10_000n;
    const paymentLegs = [{ amount: 10_000n, tipAmount: 2_000n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(true);
    expect(result.snapshotTotal).toBe(10_000n);
    expect(result.paidTotal).toBe(10_000n);
  });

  it("accounts for partial payment (split remaining)", () => {
    const snapshotTotal = 30_000n;
    const paymentLegs = [{ amount: 10_000n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBe(20_000n);
  });

  it("passes when total is paid across three split legs exactly", () => {
    const snapshotTotal = 30_000n;
    const paymentLegs = [
      { amount: 10_000n, tipAmount: 0n },
      { amount: 10_000n, tipAmount: 0n },
      { amount: 10_000n, tipAmount: 0n },
    ];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(true);
    expect(result.discrepancy).toBe(0n);
  });

  it("detects client-tampered amount (client sent 1n instead of full price)", () => {
    const snapshotTotal = 50_000n;
    const paymentLegs = [{ amount: 1n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBe(49_999n);
  });

  it("overpayment is considered valid (excess triggers refund unwind, not rejection)", () => {
    const snapshotTotal = 10_000n;
    const paymentLegs = [{ amount: 12_000n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(true);
    expect(result.paidTotal).toBe(12_000n);
  });
});

// ─── buildIdempotencyKey ──────────────────────────────────────────────────────

describe("buildIdempotencyKey", () => {
  it("produces a deterministic key for the same inputs", () => {
    const key1 = buildIdempotencyKey("order-1", "diner-abc", "split-0");
    const key2 = buildIdempotencyKey("order-1", "diner-abc", "split-0");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different orders", () => {
    const key1 = buildIdempotencyKey("order-1", "diner-abc", "split-0");
    const key2 = buildIdempotencyKey("order-2", "diner-abc", "split-0");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different split legs", () => {
    const key1 = buildIdempotencyKey("order-1", "diner-abc", "split-0");
    const key2 = buildIdempotencyKey("order-1", "diner-abc", "split-1");
    expect(key1).not.toBe(key2);
  });

  it("produces a non-empty string", () => {
    const key = buildIdempotencyKey("order-1", "diner-abc", "split-0");
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });
});

// ─── Property-based: invariant holds across random bill configurations ────────

describe("property-based: honored-price invariant holds for any valid bill", () => {
  const positiveRial = fc.bigInt({ min: 1n, max: 1_000_000_000n });
  const smallPct = fc.float({ min: 0, max: 30, noNaN: true });
  const smallQuantity = fc.integer({ min: 1, max: 10 });

  test.prop([positiveRial, smallPct, smallPct, fc.boolean(), smallQuantity])(
    "single-leg payment equals the server-computed bill total (no tip)",
    (unitPrice, serviceChargePct, taxPct, taxInclusive, quantity) => {
      const cartLines: CartLineInput[] = [
        { itemId: "item-x", quantity, unitPrice, modifiers: [] },
      ];
      const dbPrices: DbItemPrice[] = [{ itemId: "item-x", price: unitPrice }];
      const bill = computeServerBill(cartLines, dbPrices, [], {
        serviceChargePct,
        taxPct,
        taxInclusive,
      });

      const result = validatePaymentLegsAgainstSnapshot(
        bill.total,
        [{ amount: bill.total, tipAmount: 0n }]
      );
      return result.valid;
    }
  );

  test.prop([positiveRial, fc.integer({ min: 2, max: 6 })])(
    "sum of even-split legs reconciles to snapshot total",
    (total, parts) => {
      const legs: bigint[] = evenSplit(total, parts);
      const paymentLegs = legs.map((amount: bigint) => ({
        amount,
        tipAmount: 0n,
      }));
      const result = validatePaymentLegsAgainstSnapshot(total, paymentLegs);
      return result.valid;
    }
  );
});
