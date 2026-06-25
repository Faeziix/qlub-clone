/**
 * Tests for issue #9 — server-authoritative pricing + honored-price rule +
 * concurrency + idempotency.
 *
 * These are pure unit tests on the service-layer helpers; no DB is required.
 *
 * Reconciliation invariant semantics (see ADR-0006 §3):
 *   - validatePaymentLegsAgainstSnapshot checks that cumulative legs do NOT
 *     exceed the snapshot total. A single partial leg is VALID (the order
 *     is not yet fully paid, but no overpayment exists).
 *   - isFullyPaid (money.ts) is the separate "fully paid" check.
 *   - The invariant is violated only when paidTotal > snapshotTotal
 *     (overpayment that triggers the refund-unwind path).
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
import { isFullyPaid } from "@/lib/money";

// ─── Helpers shared across test groups ───────────────────────────────────────

type DbItemPrice = { itemId: string; price: bigint; name?: string };
type DbModifierPrice = { optionId: string; priceDelta: bigint; name?: string };

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

  it("carries item name in the change notice", () => {
    const cartLines: CartLineInput[] = [
      { itemId: "item-1", quantity: 1, unitPrice: 10_000n, modifiers: [] },
    ];
    const dbPrices: DbItemPrice[] = [
      { itemId: "item-1", price: 12_000n, name: "چایی" },
    ];
    const changes = detectPriceChanges(cartLines, dbPrices, []);
    expect(changes[0].itemName).toBe("چایی");
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
//
// The invariant: cumulative leg amounts must NOT exceed the snapshot total.
// A partial leg (sum < snapshot) is VALID — order just isn't fully paid yet.
// Only when paidTotal > snapshotTotal is the invariant violated (overpayment).
// Use isFullyPaid (money.ts) separately to check if an order is closed.

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

  it("passes for a single partial split leg (order not yet fully paid — not an invariant violation)", () => {
    const snapshotTotal = 30_000n;
    const paymentLegs = [{ amount: 10_000n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(true);
    expect(result.paidTotal).toBe(10_000n);
    expect(result.discrepancy).toBe(0n);
  });

  it("excludes tip from the snapshot comparison (tip is tracked separately)", () => {
    const snapshotTotal = 10_000n;
    const paymentLegs = [{ amount: 10_000n, tipAmount: 2_000n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(true);
    expect(result.snapshotTotal).toBe(10_000n);
    expect(result.paidTotal).toBe(10_000n);
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

  it("VIOLATES invariant when legs exceed snapshot (overpayment requiring refund)", () => {
    const snapshotTotal = 10_000n;
    const paymentLegs = [{ amount: 12_000n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(false);
    expect(result.paidTotal).toBe(12_000n);
    expect(result.discrepancy).toBe(2_000n);
  });

  it("VIOLATES invariant when cumulative legs of a split exceed snapshot", () => {
    const snapshotTotal = 20_000n;
    const paymentLegs = [
      { amount: 15_000n, tipAmount: 0n },
      { amount: 10_000n, tipAmount: 0n },
    ];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBe(5_000n);
  });

  it("detects client-tampered amount that exceeds snapshot (client sent inflated leg)", () => {
    const snapshotTotal = 10_000n;
    const paymentLegs = [{ amount: 999_999n, tipAmount: 0n }];

    const result = validatePaymentLegsAgainstSnapshot(snapshotTotal, paymentLegs);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBeGreaterThan(0n);
  });

  it("a single partial leg is valid — isFullyPaid separately checks closure", () => {
    const snapshotTotal = 50_000n;
    const partialLeg = { amount: 1n, tipAmount: 0n };

    const invariantResult = validatePaymentLegsAgainstSnapshot(snapshotTotal, [partialLeg]);
    expect(invariantResult.valid).toBe(true);

    const fullyPaid = isFullyPaid(partialLeg.amount, snapshotTotal);
    expect(fullyPaid).toBe(false);
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

  test.prop([positiveRial, fc.integer({ min: 2, max: 6 })])(
    "each individual even-split leg is a valid partial payment (invariant not violated)",
    (total, parts) => {
      const legs: bigint[] = evenSplit(total, parts);
      return legs.every((amount) => {
        const result = validatePaymentLegsAgainstSnapshot(total, [{ amount, tipAmount: 0n }]);
        return result.valid;
      });
    }
  );

  test.prop([
    fc.bigInt({ min: 10n, max: 1_000_000_000n }),
    fc.integer({ min: 2, max: 6 }),
  ])(
    "individual even-split leg does not exceed total (invariant never violated per leg)",
    (total, parts) => {
      const legs: bigint[] = evenSplit(total, parts);
      const allLegsValid = legs.every((amount) => {
        const result = validatePaymentLegsAgainstSnapshot(total, [{ amount, tipAmount: 0n }]);
        return result.valid;
      });
      const cumulativeValid = validatePaymentLegsAgainstSnapshot(
        total,
        legs.map((amount) => ({ amount, tipAmount: 0n }))
      ).valid;
      return allLegsValid && cumulativeValid;
    }
  );
});

// ─── Integration-style: recordPayment path invariant ─────────────────────────
//
// These tests simulate the recordPayment path against an in-memory order
// (no DB) to verify the invariant is correctly applied without rejecting
// valid partial split legs.

describe("recordPayment-path invariant simulation", () => {
  function simulateRecordPayment(
    orderTotal: bigint,
    succeededLegs: Array<{ amount: bigint; tipAmount: bigint }>,
    newLeg: { amount: bigint; tipAmount: bigint }
  ) {
    const newAmount = newLeg.amount;
    const alreadyPaid = succeededLegs.reduce((s, p) => s + p.amount, 0n);
    const remaining = orderTotal > alreadyPaid ? orderTotal - alreadyPaid : 0n;

    if (newAmount > remaining) {
      return { ok: false, reason: "exceeds-remaining" as const };
    }

    const allLegs = [...succeededLegs, newLeg];
    const invariantResult = validatePaymentLegsAgainstSnapshot(orderTotal, allLegs);

    if (!invariantResult.valid) {
      return { ok: false, reason: "invariant-violated" as const, invariantResult };
    }

    const newAmountPaid = alreadyPaid + newAmount;
    const fullyPaid = isFullyPaid(newAmountPaid, orderTotal);
    return { ok: true, fullyPaid, newAmountPaid };
  }

  it("accepts first leg of an even split (partial payment)", () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const result = simulateRecordPayment(orderTotal, [], { amount: legs[0], tipAmount: 0n });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fullyPaid).toBe(false);
    }
  });

  it("accepts second leg after first leg was recorded", () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const firstLeg = { amount: legs[0], tipAmount: 0n };
    const secondLeg = { amount: legs[1], tipAmount: 0n };
    const result = simulateRecordPayment(orderTotal, [firstLeg], secondLeg);
    expect(result.ok).toBe(true);
  });

  it("marks order fully paid when final leg settles the balance", () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const result = simulateRecordPayment(
      orderTotal,
      [{ amount: legs[0], tipAmount: 0n }, { amount: legs[1], tipAmount: 0n }],
      { amount: legs[2], tipAmount: 0n }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fullyPaid).toBe(true);
      expect(result.newAmountPaid).toBe(orderTotal);
    }
  });

  it("rejects a leg that would exceed remaining balance", () => {
    const orderTotal = 20_000n;
    const result = simulateRecordPayment(
      orderTotal,
      [{ amount: 15_000n, tipAmount: 0n }],
      { amount: 10_000n, tipAmount: 0n }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("exceeds-remaining");
  });

  it("rejects a full-payment leg with client-tampered amount exceeding snapshot", () => {
    const orderTotal = 20_000n;
    const result = simulateRecordPayment(
      orderTotal,
      [],
      { amount: 999_999n, tipAmount: 0n }
    );
    expect(result.ok).toBe(false);
  });

  it("accepts partial by-items split leg (less than total)", () => {
    const orderTotal = 50_000n;
    const partialAmount = 20_000n;
    const result = simulateRecordPayment(orderTotal, [], { amount: partialAmount, tipAmount: 0n });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fullyPaid).toBe(false);
    }
  });

  it("accepts custom split partial amount", () => {
    const orderTotal = 100_000n;
    const result = simulateRecordPayment(orderTotal, [], { amount: 30_000n, tipAmount: 0n });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fullyPaid).toBe(false);
    }
  });
});
