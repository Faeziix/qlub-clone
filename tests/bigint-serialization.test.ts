/**
 * Tests that /api/orders and /api/payments return valid JSON with numeric money
 * fields (not BigInt), verifying the serialization boundary is correct.
 *
 * Uses unit-level testing of the serialization helpers rather than spinning up
 * an HTTP server, since the Next.js App Router cannot be instantiated in vitest
 * without a full build. The helpers are the only thing that can regress here.
 */
import { describe, it, expect } from "vitest";
import {
  serializeOrder,
  serializePaymentResult,
} from "@/lib/api-serializers";

describe("serializeOrder — BigInt money fields become numbers", () => {
  const fakeOrder = {
    id: "ord_1",
    orderNumber: "Q-123456-abc",
    vendorId: "v1",
    tableId: null,
    type: "qsr",
    status: "placed",
    guestName: "Ali",
    guestPhone: null,
    notes: null,
    currency: "IRR",
    subtotal: BigInt(150_000),
    serviceCharge: BigInt(15_000),
    tax: BigInt(10_000),
    discount: BigInt(0),
    tipAmount: BigInt(0),
    total: BigInt(175_000),
    amountPaid: BigInt(0),
    createdAt: new Date("2025-01-01T12:00:00Z"),
    updatedAt: new Date("2025-01-01T12:00:00Z"),
    items: [
      {
        id: "oi_1",
        orderId: "ord_1",
        itemId: "item_1",
        name: "چلو کباب",
        unitPrice: BigInt(150_000),
        quantity: 1,
        modifiers: "[]",
        notes: null,
        lineTotal: BigInt(150_000),
        createdAt: new Date("2025-01-01T12:00:00Z"),
      },
    ],
    vendor: {
      id: "v1",
      slug: "test-vendor",
      name: "Test",
      currency: "IRR",
      supportedLangs: '["fa"]',
      tipPresets: "[10, 15, 20]",
      serviceChargePct: 10,
      taxPct: 9,
      taxInclusive: false,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    },
    table: null,
  };

  it("converts subtotal from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.subtotal).toBe("number");
    expect(result.subtotal).toBe(150_000);
  });

  it("converts serviceCharge from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.serviceCharge).toBe("number");
    expect(result.serviceCharge).toBe(15_000);
  });

  it("converts tax from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.tax).toBe("number");
    expect(result.tax).toBe(10_000);
  });

  it("converts discount from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.discount).toBe("number");
    expect(result.discount).toBe(0);
  });

  it("converts tipAmount from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.tipAmount).toBe("number");
    expect(result.tipAmount).toBe(0);
  });

  it("converts total from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.total).toBe("number");
    expect(result.total).toBe(175_000);
  });

  it("converts amountPaid from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.amountPaid).toBe("number");
    expect(result.amountPaid).toBe(0);
  });

  it("converts item unitPrice from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.items[0].unitPrice).toBe("number");
    expect(result.items[0].unitPrice).toBe(150_000);
  });

  it("converts item lineTotal from BigInt to number", () => {
    const result = serializeOrder(fakeOrder);
    expect(typeof result.items[0].lineTotal).toBe("number");
    expect(result.items[0].lineTotal).toBe(150_000);
  });

  it("result can be round-tripped through JSON.stringify without throwing", () => {
    const result = serializeOrder(fakeOrder);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("JSON output money fields are numbers, not strings", () => {
    const result = serializeOrder(fakeOrder);
    const parsed = JSON.parse(JSON.stringify(result));
    expect(typeof parsed.subtotal).toBe("number");
    expect(typeof parsed.total).toBe("number");
    expect(typeof parsed.items[0].unitPrice).toBe("number");
  });
});

describe("serializePaymentResult — BigInt money fields become numbers", () => {
  const fakePayment = {
    id: "pay_1",
    orderId: "ord_1",
    vendorId: "v1",
    amount: BigInt(175_000),
    tipAmount: BigInt(20_000),
    total: BigInt(195_000),
    currency: "IRR",
    method: "cash",
    status: "succeeded",
    splitType: "full",
    splitMeta: null,
    payerName: null,
    payerEmail: null,
    reference: "pay_abc123",
    createdAt: new Date("2025-01-01T12:00:00Z"),
    updatedAt: new Date("2025-01-01T12:00:00Z"),
  };

  it("converts payment amount from BigInt to number", () => {
    const result = serializePaymentResult({
      payment: fakePayment,
      fullyPaid: true,
      amountPaid: 175_000,
    });
    expect(typeof result.payment.amount).toBe("number");
    expect(result.payment.amount).toBe(175_000);
  });

  it("converts payment tipAmount from BigInt to number", () => {
    const result = serializePaymentResult({
      payment: fakePayment,
      fullyPaid: true,
      amountPaid: 175_000,
    });
    expect(typeof result.payment.tipAmount).toBe("number");
    expect(result.payment.tipAmount).toBe(20_000);
  });

  it("converts payment total from BigInt to number", () => {
    const result = serializePaymentResult({
      payment: fakePayment,
      fullyPaid: true,
      amountPaid: 175_000,
    });
    expect(typeof result.payment.total).toBe("number");
    expect(result.payment.total).toBe(195_000);
  });

  it("passes through fullyPaid and amountPaid unchanged", () => {
    const result = serializePaymentResult({
      payment: fakePayment,
      fullyPaid: true,
      amountPaid: 175_000,
    });
    expect(result.fullyPaid).toBe(true);
    expect(result.amountPaid).toBe(175_000);
  });

  it("result can be round-tripped through JSON.stringify without throwing", () => {
    const result = serializePaymentResult({
      payment: fakePayment,
      fullyPaid: true,
      amountPaid: 175_000,
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("JSON output payment money fields are numbers, not strings", () => {
    const result = serializePaymentResult({
      payment: fakePayment,
      fullyPaid: true,
      amountPaid: 175_000,
    });
    const parsed = JSON.parse(JSON.stringify(result));
    expect(typeof parsed.payment.amount).toBe("number");
    expect(typeof parsed.payment.total).toBe("number");
  });
});
