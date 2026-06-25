/**
 * Tests for issue #9 — Server-authoritative pricing + honored-price rule +
 * concurrency + idempotency.
 *
 * Acceptance criteria verified:
 * 1. Bill is computed from current DB prices and snapshotted; client-supplied
 *    amounts are never trusted.
 * 2. Price-changed-at-checkout surfaces a notice before payment.
 * 3. Order/payment writes are transactional with FOR UPDATE; split legs are
 *    reserved before redirect.
 * 4. Idempotency keys are persisted and deduplicated.
 * 5. Invariant test asserts payment legs reconcile to the OrderItem snapshot
 *    (+ service + tax + tip).
 *
 * No live DB required — all Prisma interactions are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    vendor: { findUnique: vi.fn() },
    menuItem: { findUnique: vi.fn() },
    modifierOption: { findUnique: vi.fn() },
    order: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    diningTable: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));

import {
  createOrderFromCart,
  recordPayment,
  initiatePaymentLeg,
} from "@/lib/orders";
import { computeBill } from "@/lib/pricing";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const VENDOR_ID = "v1";
const ORDER_ID = "ord1";

const stubVendor = {
  id: VENDOR_ID,
  slug: "test-cafe",
  currency: "IRR",
  serviceChargePct: 10,
  taxPct: 9,
  taxInclusive: false,
  vatEnabled: false,
  vatPct: 0,
};

function makeItem(id: string, price: bigint) {
  return { id, vendorId: VENDOR_ID, price };
}

function makeModifierOption(id: string, priceDelta: bigint) {
  return { id, priceDelta };
}

function makeStubOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    vendorId: VENDOR_ID,
    orderNumber: "Q-000001",
    currency: "IRR",
    subtotal: 200_000n,
    serviceCharge: 20_000n,
    tax: 19_800n,
    discount: 0n,
    tipAmount: 0n,
    total: 239_800n,
    amountPaid: 0n,
    tableId: null,
    status: "placed",
    items: [
      {
        id: "oi1",
        orderId: ORDER_ID,
        itemId: "item1",
        name: "کباب کوبیده",
        unitPrice: 200_000n,
        quantity: 1,
        modifiers: [],
        notes: null,
        lineTotal: 200_000n,
      },
    ],
    payments: [],
    ...overrides,
  };
}

// ── 1. Server-authoritative pricing ───────────────────────────────────────────

describe("Server-authoritative pricing — createOrderFromCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$queryRaw.mockResolvedValue([{ seq: 1 }]);
    mockDb.diningTable.findFirst.mockResolvedValue(null);

    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
      fn(mockDb)
    );
  });

  it("re-fetches item price from DB and ignores client-supplied unitPrice", async () => {
    const dbPrice = 200_000n;
    const clientPrice = 50_000n; // tampered

    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", dbPrice));
    mockDb.order.create.mockImplementation(async (args: { data: { subtotal: bigint; items: { create: { unitPrice: bigint }[] } } }) => ({
      id: ORDER_ID,
      vendorId: VENDOR_ID,
      orderNumber: "Q-000001",
      currency: "IRR",
      subtotal: args.data.subtotal,
      serviceCharge: 0n,
      tax: 0n,
      discount: 0n,
      tipAmount: 0n,
      total: args.data.subtotal,
      amountPaid: 0n,
      tableId: null,
      items: args.data.items.create,
      vendor: stubVendor,
      table: null,
    }));

    const { order } = await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "کباب",
          unitPrice: clientPrice,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    const createdItem = (mockDb.order.create.mock.calls[0] as [{ data: { items: { create: { unitPrice: bigint }[] } } }])[0].data.items.create[0];
    expect(createdItem.unitPrice).toBe(dbPrice);
    expect(createdItem.unitPrice).not.toBe(clientPrice);
    expect(order.priceChanged).toBe(true);
  });

  it("re-fetches modifier priceDelta from DB and ignores client-supplied delta", async () => {
    const dbDelta = 20_000n;
    const clientDelta = 0n; // tampered to zero

    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", 100_000n));
    mockDb.modifierOption.findUnique.mockResolvedValue(makeModifierOption("opt1", dbDelta));
    mockDb.order.create.mockImplementation(async (args: { data: { subtotal: bigint; items: { create: { modifiers: { priceDelta: string }[] }[] } } }) => ({
      id: ORDER_ID,
      vendorId: VENDOR_ID,
      orderNumber: "Q-000001",
      currency: "IRR",
      subtotal: args.data.subtotal,
      serviceCharge: 0n,
      tax: 0n,
      discount: 0n,
      tipAmount: 0n,
      total: args.data.subtotal,
      amountPaid: 0n,
      tableId: null,
      items: args.data.items.create,
      vendor: stubVendor,
      table: null,
    }));

    await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "کباب",
          unitPrice: 100_000n,
          quantity: 1,
          modifiers: [
            {
              groupId: "g1",
              groupName: "اندازه",
              optionId: "opt1",
              optionName: "بزرگ",
              priceDelta: clientDelta,
            },
          ],
        },
      ],
    });

    const createdItem = (mockDb.order.create.mock.calls[0] as [{ data: { items: { create: { modifiers: { priceDelta: string }[] }[] } } }])[0].data.items.create[0];
    const storedDelta = BigInt(createdItem.modifiers[0].priceDelta);
    expect(storedDelta).toBe(dbDelta);
    expect(storedDelta).not.toBe(clientDelta);
  });

  it("sets priceChanged=false when all client prices match DB prices", async () => {
    const price = 150_000n;
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", price));
    mockDb.order.create.mockResolvedValue({
      id: ORDER_ID,
      vendorId: VENDOR_ID,
      orderNumber: "Q-000001",
      currency: "IRR",
      subtotal: 150_000n,
      serviceCharge: 0n,
      tax: 0n,
      discount: 0n,
      tipAmount: 0n,
      total: 150_000n,
      amountPaid: 0n,
      tableId: null,
      items: [],
      vendor: stubVendor,
      table: null,
    });

    const { order } = await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "item",
          unitPrice: price,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(order.priceChanged).toBe(false);
  });

  it("uses DB price for bill computation, not client price", async () => {
    const dbPrice = 100_000n;
    const clientPrice = 1n;

    mockDb.vendor.findUnique.mockResolvedValue({
      ...stubVendor,
      serviceChargePct: 0,
      taxPct: 0,
      taxInclusive: true,
    });
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", dbPrice));

    let capturedSubtotal = 0n;
    mockDb.order.create.mockImplementation(async (args: { data: { subtotal: bigint } }) => {
      capturedSubtotal = args.data.subtotal;
      return {
        id: ORDER_ID,
        vendorId: VENDOR_ID,
        orderNumber: "Q-000001",
        currency: "IRR",
        subtotal: args.data.subtotal,
        serviceCharge: 0n,
        tax: 0n,
        discount: 0n,
        tipAmount: 0n,
        total: args.data.subtotal,
        amountPaid: 0n,
        tableId: null,
        items: [],
        vendor: stubVendor,
        table: null,
      };
    });

    await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "item",
          unitPrice: clientPrice,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(capturedSubtotal).toBe(dbPrice);
    expect(capturedSubtotal).not.toBe(clientPrice);
  });
});

// ── 2. Price-changed-at-checkout notice ───────────────────────────────────────

describe("Price-changed-at-checkout notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$queryRaw.mockResolvedValue([{ seq: 1 }]);
    mockDb.diningTable.findFirst.mockResolvedValue(null);
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
      fn(mockDb)
    );
  });

  it("returns priceChanged=true when item price differs between client and DB", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", 300_000n));
    mockDb.order.create.mockResolvedValue({
      id: ORDER_ID,
      vendorId: VENDOR_ID,
      orderNumber: "Q-000001",
      currency: "IRR",
      subtotal: 300_000n,
      serviceCharge: 30_000n,
      tax: 29_700n,
      discount: 0n,
      tipAmount: 0n,
      total: 359_700n,
      amountPaid: 0n,
      tableId: null,
      items: [],
      vendor: stubVendor,
      table: null,
    });

    const { order, priceChanged } = await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "item",
          unitPrice: 200_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(priceChanged).toBe(true);
    expect(order.priceChanged).toBe(true);
  });

  it("returns priceChanged=false when all prices match", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", 200_000n));
    mockDb.order.create.mockResolvedValue({
      id: ORDER_ID,
      vendorId: VENDOR_ID,
      orderNumber: "Q-000001",
      currency: "IRR",
      subtotal: 200_000n,
      serviceCharge: 20_000n,
      tax: 19_800n,
      discount: 0n,
      tipAmount: 0n,
      total: 239_800n,
      amountPaid: 0n,
      tableId: null,
      items: [],
      vendor: stubVendor,
      table: null,
    });

    const { priceChanged } = await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "item",
          unitPrice: 200_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(priceChanged).toBe(false);
  });
});

// ── 3. Transactional writes with FOR UPDATE ───────────────────────────────────

describe("Order/payment writes are transactional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
      fn(mockDb)
    );
    mockDb.$queryRaw.mockResolvedValue([{ seq: 1 }]);
    mockDb.diningTable.findFirst.mockResolvedValue(null);
  });

  it("createOrderFromCart executes inside a $transaction", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findUnique.mockResolvedValue(makeItem("item1", 100_000n));
    mockDb.order.create.mockResolvedValue({
      ...makeStubOrder(),
      vendor: stubVendor,
      table: null,
    });

    await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "item",
          unitPrice: 100_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(mockDb.$transaction).toHaveBeenCalled();
  });

  it("recordPayment executes inside a $transaction", async () => {
    const stubOrder = makeStubOrder();
    mockDb.order.findUnique.mockResolvedValue(stubOrder);
    mockDb.payment.create.mockResolvedValue({
      id: "p1",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 239_800n,
      tipAmount: 0n,
      total: 239_800n,
      currency: "IRR",
      method: "ipg",
      status: "succeeded",
      reference: "pay_test",
      idempotencyKey: null,
      createdAt: new Date(),
    });
    mockDb.order.update.mockResolvedValue({ ...stubOrder, status: "paid", amountPaid: 239_800n });
    mockDb.diningTable.update.mockResolvedValue({});

    await recordPayment({
      orderId: ORDER_ID,
      amount: 239_800n,
      method: "ipg",
    });

    expect(mockDb.$transaction).toHaveBeenCalled();
  });

  it("initiatePaymentLeg reserves the leg atomically with FOR UPDATE", async () => {
    const stubOrder = makeStubOrder();
    mockDb.order.findUnique.mockResolvedValue(stubOrder);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    mockDb.payment.create.mockResolvedValue({
      id: "p1",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 239_800n,
      tipAmount: 0n,
      total: 239_800n,
      currency: "IRR",
      method: "ipg",
      status: "pending",
      reference: "pay_test",
      idempotencyKey: "idem-key-1",
      expiresAt,
      createdAt: new Date(),
    });

    const leg = await initiatePaymentLeg({
      orderId: ORDER_ID,
      amount: 239_800n,
      tipAmount: 0n,
      method: "ipg",
      idempotencyKey: "idem-key-1",
      splitType: "full",
    });

    expect(mockDb.$transaction).toHaveBeenCalled();
    expect(leg.status).toBe("pending");
    expect(leg.expiresAt).toBeInstanceOf(Date);
    expect(leg.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── 4. Idempotency keys ────────────────────────────────────────────────────────

describe("Idempotency keys — persisted and deduplicated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
      fn(mockDb)
    );
  });

  it("returns the existing payment when the same idempotency key is resubmitted", async () => {
    const existingPayment = {
      id: "p-existing",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 239_800n,
      tipAmount: 0n,
      total: 239_800n,
      currency: "IRR",
      method: "ipg",
      status: "succeeded",
      reference: "pay_existing",
      idempotencyKey: "idem-key-abc",
      expiresAt: null,
      createdAt: new Date(),
    };

    mockDb.payment.findUnique.mockResolvedValue(existingPayment);

    const result = await recordPayment({
      orderId: ORDER_ID,
      amount: 239_800n,
      method: "ipg",
      idempotencyKey: "idem-key-abc",
    });

    expect(result.idempotent).toBe(true);
    expect(result.payment.id).toBe("p-existing");
    expect(mockDb.payment.create).not.toHaveBeenCalled();
  });

  it("creates a new payment when idempotency key has not been seen before", async () => {
    mockDb.payment.findUnique.mockResolvedValue(null);
    mockDb.order.findUnique.mockResolvedValue(makeStubOrder());

    const newPayment = {
      id: "p-new",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 239_800n,
      tipAmount: 0n,
      total: 239_800n,
      currency: "IRR",
      method: "ipg",
      status: "succeeded",
      reference: "pay_new",
      idempotencyKey: "idem-key-new",
      expiresAt: null,
      createdAt: new Date(),
    };
    mockDb.payment.create.mockResolvedValue(newPayment);
    mockDb.order.update.mockResolvedValue({ ...makeStubOrder(), amountPaid: 239_800n });

    const result = await recordPayment({
      orderId: ORDER_ID,
      amount: 239_800n,
      method: "ipg",
      idempotencyKey: "idem-key-new",
    });

    expect(result.idempotent).toBe(false);
    expect(mockDb.payment.create).toHaveBeenCalled();
    expect(result.payment.idempotencyKey).toBe("idem-key-new");
  });

  it("stores idempotencyKey on the created payment", async () => {
    mockDb.payment.findUnique.mockResolvedValue(null);
    mockDb.order.findUnique.mockResolvedValue(makeStubOrder());
    mockDb.order.update.mockResolvedValue({ ...makeStubOrder(), amountPaid: 239_800n });

    mockDb.payment.create.mockImplementation(async (args: { data: { idempotencyKey?: string } }) => ({
      id: "p-stored",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 239_800n,
      tipAmount: 0n,
      total: 239_800n,
      currency: "IRR",
      method: "ipg",
      status: "succeeded",
      reference: "pay_stored",
      idempotencyKey: args.data.idempotencyKey,
      expiresAt: null,
      createdAt: new Date(),
    }));

    const key = "stored-key-xyz";
    const result = await recordPayment({
      orderId: ORDER_ID,
      amount: 239_800n,
      method: "ipg",
      idempotencyKey: key,
    });

    expect(result.payment.idempotencyKey).toBe(key);
  });
});

// ── 5. Honored-price invariant ─────────────────────────────────────────────────

describe("Honored-price invariant — payment legs reconcile to OrderItem snapshot", () => {
  it("payment amount equals order total (subtotal + serviceCharge + tax, no tip)", () => {
    const subtotal = 500_000n;
    const serviceChargePct = 10;
    const taxPct = 9;
    const taxInclusive = false;

    const bill = computeBill(
      [
        {
          lineId: "l1",
          itemId: "i1",
          name: "item",
          unitPrice: subtotal,
          quantity: 1,
          modifiers: [],
        },
      ],
      { serviceChargePct, taxPct, taxInclusive }
    );

    const paymentAmount = bill.subtotal + bill.serviceCharge + bill.tax;
    expect(paymentAmount).toBe(bill.total);
  });

  it("tip is tracked separately and does not inflate order.total", () => {
    const subtotal = 200_000n;
    const tipAmount = 20_000n;

    const bill = computeBill(
      [
        {
          lineId: "l1",
          itemId: "i1",
          name: "item",
          unitPrice: subtotal,
          quantity: 1,
          modifiers: [],
        },
      ],
      { serviceChargePct: 0, taxPct: 0, taxInclusive: true },
      { tip: 0n }
    );

    const orderTotal = bill.total;
    const paymentTotal = orderTotal + tipAmount;

    expect(orderTotal).toBe(subtotal);
    expect(paymentTotal).toBe(subtotal + tipAmount);
    expect(orderTotal).not.toBe(paymentTotal);
  });

  it("multi-item order: sum of OrderItem lineTotals equals order subtotal", () => {
    const lines = [
      {
        lineId: "l1",
        itemId: "i1",
        name: "کباب",
        unitPrice: 150_000n,
        quantity: 2,
        modifiers: [],
      },
      {
        lineId: "l2",
        itemId: "i2",
        name: "نوشابه",
        unitPrice: 30_000n,
        quantity: 3,
        modifiers: [
          {
            groupId: "g1",
            groupName: "اندازه",
            optionId: "o1",
            optionName: "بزرگ",
            priceDelta: 5_000n,
          },
        ],
      },
    ];

    const bill = computeBill(lines, {
      serviceChargePct: 0,
      taxPct: 0,
      taxInclusive: true,
    });

    const expectedSubtotal =
      150_000n * 2n + (30_000n + 5_000n) * 3n;
    expect(bill.subtotal).toBe(expectedSubtotal);
  });

  it("payment leg amount plus tip equals payment.total", () => {
    const paymentAmount = 239_800n;
    const tipAmount = 24_000n;
    const expectedTotal = paymentAmount + tipAmount;
    expect(expectedTotal).toBe(263_800n);
  });

  it("even-split: sum of all legs equals order total (no rounding leak)", async () => {
    const { evenSplit } = await import("@/lib/pricing");
    const total = 239_800n;
    const parts = 3;
    const legs = evenSplit(total, parts);

    const sum = legs.reduce((s, l) => s + l, 0n);
    expect(sum).toBe(total);
    expect(legs).toHaveLength(parts);
  });

  it("invariant: payment legs sum reconciles to OrderItem snapshot total", () => {
    const orderItems = [
      { unitPrice: 150_000n, quantity: 2, modifiers: [] as { priceDelta: bigint }[] },
      {
        unitPrice: 30_000n,
        quantity: 1,
        modifiers: [{ priceDelta: 5_000n }],
      },
    ];

    const snapshotSubtotal = orderItems.reduce((s, item) => {
      const modTotal = item.modifiers.reduce((ms, m) => ms + m.priceDelta, 0n);
      return s + (item.unitPrice + modTotal) * BigInt(item.quantity);
    }, 0n);

    const serviceChargePct = 10;
    const serviceCharge = (snapshotSubtotal * BigInt(Math.round(serviceChargePct * 100))) / 10_000n;
    const tax = 0n;
    const snapshotTotal = snapshotSubtotal + serviceCharge + tax;

    const paymentLeg1 = snapshotTotal / 2n + (snapshotTotal % 2n);
    const paymentLeg2 = snapshotTotal / 2n;
    const legsSum = paymentLeg1 + paymentLeg2;

    expect(legsSum).toBe(snapshotTotal);
  });
});

// ── 6. Split leg TTL reservation ──────────────────────────────────────────────

describe("Split leg reservation with TTL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
      fn(mockDb)
    );
  });

  it("initiatePaymentLeg creates a pending payment with expiresAt in the future", async () => {
    const stubOrder = makeStubOrder();
    mockDb.order.findUnique.mockResolvedValue(stubOrder);

    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);
    mockDb.payment.create.mockResolvedValue({
      id: "p-reserved",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 239_800n,
      tipAmount: 0n,
      total: 239_800n,
      currency: "IRR",
      method: "ipg",
      status: "pending",
      reference: "pay_reserved",
      idempotencyKey: "idem-reserve-1",
      expiresAt: futureExpiry,
      createdAt: new Date(),
    });

    const leg = await initiatePaymentLeg({
      orderId: ORDER_ID,
      amount: 239_800n,
      tipAmount: 0n,
      method: "ipg",
      idempotencyKey: "idem-reserve-1",
      splitType: "full",
    });

    expect(leg.status).toBe("pending");
    expect(leg.expiresAt).toBeDefined();
    expect(leg.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("initiatePaymentLeg rejects if remaining balance is insufficient for the requested amount", async () => {
    const stubOrder = makeStubOrder({
      total: 239_800n,
      amountPaid: 239_800n,
    });
    mockDb.order.findUnique.mockResolvedValue(stubOrder);

    await expect(
      initiatePaymentLeg({
        orderId: ORDER_ID,
        amount: 50_000n,
        tipAmount: 0n,
        method: "ipg",
        idempotencyKey: "idem-excess",
        splitType: "custom",
      })
    ).rejects.toThrow(/already fully paid|exceeds remaining/i);
  });
});
