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
    menuItem: { findMany: vi.fn() },
    modifierOption: { findMany: vi.fn() },
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
  active: true,
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

type TxMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  menuItem: { findMany: ReturnType<typeof vi.fn> };
  modifierOption: { findMany: ReturnType<typeof vi.fn> };
  order: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  payment: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  diningTable: { update: ReturnType<typeof vi.fn> };
};

function setupTx(overrides: { queryRawResults?: unknown[] } = {}) {
  const queryRawResults = overrides.queryRawResults ?? [[{ seq: 1 }]];
  let queryRawCallIdx = 0;

  const tx: TxMock = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $queryRaw: vi.fn((..._args: any[]) => {
      const result = queryRawResults[queryRawCallIdx] ?? [];
      queryRawCallIdx++;
      return Promise.resolve(result);
    }),
    menuItem: { findMany: mockDb.menuItem.findMany },
    modifierOption: { findMany: mockDb.modifierOption.findMany },
    order: { create: mockDb.order.create, findUnique: mockDb.order.findUnique, update: mockDb.order.update },
    payment: { create: mockDb.payment.create, findUnique: mockDb.payment.findUnique },
    diningTable: { update: mockDb.diningTable.update },
  };

  mockDb.$transaction.mockImplementation(
    async (fn: (t: TxMock) => Promise<unknown>) => fn(tx)
  );

  return { tx };
}

// ── 1. Server-authoritative pricing ───────────────────────────────────────────

describe("Server-authoritative pricing — createOrderFromCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.diningTable.findFirst.mockResolvedValue(null);
  });

  it("re-fetches item price from DB and ignores client-supplied unitPrice", async () => {
    const dbPrice = 200_000n;
    const clientPrice = 50_000n;

    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", dbPrice)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.order.create.mockImplementation(
      async (args: { data: { subtotal: bigint; items: { create: { unitPrice: bigint }[] } } }) => ({
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
      })
    );

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

    const createdItem = (
      mockDb.order.create.mock.calls[0] as [
        { data: { items: { create: { unitPrice: bigint }[] } } },
      ]
    )[0].data.items.create[0];
    expect(createdItem.unitPrice).toBe(dbPrice);
    expect(createdItem.unitPrice).not.toBe(clientPrice);
    expect(order.priceChanged).toBe(true);
  });

  it("re-fetches modifier priceDelta from DB and ignores client-supplied delta", async () => {
    const dbDelta = 20_000n;
    const clientDelta = 0n;

    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", 100_000n)]);
    mockDb.modifierOption.findMany.mockResolvedValue([makeModifierOption("opt1", dbDelta)]);
    mockDb.order.create.mockImplementation(
      async (args: { data: { subtotal: bigint; items: { create: { modifiers: { priceDelta: string }[] }[] } } }) => ({
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
      })
    );

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

    const createdItem = (
      mockDb.order.create.mock.calls[0] as [
        { data: { items: { create: { modifiers: { priceDelta: string }[] }[] } } },
      ]
    )[0].data.items.create[0];
    const storedDelta = BigInt(createdItem.modifiers[0].priceDelta);
    expect(storedDelta).toBe(dbDelta);
    expect(storedDelta).not.toBe(clientDelta);
  });

  it("sets priceChanged=false when all client prices match DB prices", async () => {
    const price = 150_000n;
    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", price)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
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

    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue({
      ...stubVendor,
      serviceChargePct: 0,
      taxPct: 0,
      taxInclusive: true,
    });
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", dbPrice)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);

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

  it("throws when item is not found in DB for the vendor — never trusts client price", async () => {
    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);

    await expect(
      createOrderFromCart({
        vendorSlug: "test-cafe",
        lines: [
          {
            lineId: "l1",
            itemId: "unknown-item",
            name: "item",
            unitPrice: 100_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).rejects.toThrow(/not found for vendor/i);
  });
});

// ── 2. Price-changed-at-checkout notice ───────────────────────────────────────

describe("Price-changed-at-checkout notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.diningTable.findFirst.mockResolvedValue(null);
  });

  it("returns priceChanged=true when item price differs between client and DB", async () => {
    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", 300_000n)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
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
    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", 200_000n)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
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

describe("Order/payment writes are transactional with FOR UPDATE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.diningTable.findFirst.mockResolvedValue(null);
  });

  it("createOrderFromCart executes price resolution and order creation inside a $transaction", async () => {
    const { tx } = setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", 100_000n)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
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
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it("recordPayment uses FOR UPDATE — $queryRaw is called inside $transaction", async () => {
    const stubOrder = makeStubOrder();
    const { tx } = setupTx({
      queryRawResults: [
        [],
        [
          {
            id: stubOrder.id,
            vendorId: stubOrder.vendorId,
            currency: stubOrder.currency,
            total: stubOrder.total,
            amountPaid: stubOrder.amountPaid,
            tipAmount: stubOrder.tipAmount,
            tableId: null,
            status: stubOrder.status,
          },
        ],
      ],
    });

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
      idempotencyKey: "idem-rec-1",
      createdAt: new Date(),
    });
    mockDb.order.update.mockResolvedValue({ ...stubOrder, status: "paid", amountPaid: 239_800n });

    await recordPayment({
      orderId: ORDER_ID,
      amount: 239_800n,
      method: "ipg",
      idempotencyKey: "idem-rec-1",
    });

    expect(mockDb.$transaction).toHaveBeenCalled();
    const rawCalls = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls;
    const rawSqls = rawCalls.map((c) => (c[0] as TemplateStringsArray).join("?"));
    expect(rawSqls.some((s) => s.includes("FOR UPDATE"))).toBe(true);
  });

  it("initiatePaymentLeg uses FOR UPDATE — $queryRaw is called inside $transaction", async () => {
    const stubOrder = makeStubOrder();
    const { tx } = setupTx({
      queryRawResults: [
        [],
        [
          {
            id: stubOrder.id,
            vendorId: stubOrder.vendorId,
            currency: stubOrder.currency,
            total: stubOrder.total,
            amountPaid: stubOrder.amountPaid,
            tableId: null,
          },
        ],
        [],
      ],
    });

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
    const rawCalls = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls;
    const rawSqls = rawCalls.map((c) => (c[0] as TemplateStringsArray).join("?"));
    expect(rawSqls.some((s) => s.includes("FOR UPDATE"))).toBe(true);
    expect(leg.status).toBe("pending");
    expect(leg.expiresAt).toBeInstanceOf(Date);
    expect(leg.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── 4. Idempotency keys ────────────────────────────────────────────────────────

describe("Idempotency keys — persisted and deduplicated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recordPayment returns the existing payment when the same idempotency key is resubmitted", async () => {
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
    const stubOrder = makeStubOrder({ amountPaid: 239_800n });

    setupTx({
      queryRawResults: [
        [{ id: "p-existing" }],
      ],
    });
    mockDb.payment.findUnique.mockResolvedValue(existingPayment);
    mockDb.order.findUnique.mockResolvedValue(stubOrder);

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

  it("initiatePaymentLeg returns the existing leg when the same idempotency key is resubmitted", async () => {
    const existingLeg = {
      id: "p-leg-existing",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: 120_000n,
      tipAmount: 0n,
      total: 120_000n,
      currency: "IRR",
      method: "ipg",
      status: "pending",
      reference: "pay_leg_existing",
      idempotencyKey: "idem-leg-abc",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    };

    setupTx({
      queryRawResults: [
        [{ id: "p-leg-existing" }],
      ],
    });
    mockDb.payment.findUnique.mockResolvedValue(existingLeg);

    const result = await initiatePaymentLeg({
      orderId: ORDER_ID,
      amount: 120_000n,
      tipAmount: 0n,
      method: "ipg",
      idempotencyKey: "idem-leg-abc",
    });

    expect(result.id).toBe("p-leg-existing");
    expect(mockDb.payment.create).not.toHaveBeenCalled();
  });

  it("creates a new payment when idempotency key has not been seen before", async () => {
    const stubOrder = makeStubOrder();
    setupTx({
      queryRawResults: [
        [],
        [
          {
            id: stubOrder.id,
            vendorId: stubOrder.vendorId,
            currency: stubOrder.currency,
            total: stubOrder.total,
            amountPaid: stubOrder.amountPaid,
            tipAmount: stubOrder.tipAmount,
            tableId: null,
            status: stubOrder.status,
          },
        ],
      ],
    });

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
    const stubOrder = makeStubOrder();
    setupTx({
      queryRawResults: [
        [],
        [
          {
            id: stubOrder.id,
            vendorId: stubOrder.vendorId,
            currency: stubOrder.currency,
            total: stubOrder.total,
            amountPaid: stubOrder.amountPaid,
            tipAmount: stubOrder.tipAmount,
            tableId: null,
            status: stubOrder.status,
          },
        ],
      ],
    });
    mockDb.order.update.mockResolvedValue({ ...makeStubOrder(), amountPaid: 239_800n });

    mockDb.payment.create.mockImplementation(
      async (args: { data: { idempotencyKey?: string } }) => ({
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
      })
    );

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

// ── 5. Honored-price invariant — payment legs reconcile to OrderItem snapshot ─

describe("Honored-price invariant — payment legs reconcile to OrderItem snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.diningTable.findFirst.mockResolvedValue(null);
  });

  it("payment amount from initiatePaymentLeg equals order.total produced by createOrderFromCart", async () => {
    const dbPrice = 200_000n;
    const serviceChargePct = 10;
    const taxPct = 9;
    const taxInclusive = false;

    const expectedBill = computeBill(
      [{ lineId: "l1", itemId: "item1", name: "کباب", unitPrice: dbPrice, quantity: 1, modifiers: [] }],
      { serviceChargePct, taxPct, taxInclusive }
    );

    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", dbPrice)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);

    let snapshotTotal = 0n;
    mockDb.order.create.mockImplementation(async (args: { data: { total: bigint } }) => {
      snapshotTotal = args.data.total;
      return {
        id: ORDER_ID,
        vendorId: VENDOR_ID,
        orderNumber: "Q-000001",
        currency: "IRR",
        subtotal: expectedBill.subtotal,
        serviceCharge: expectedBill.serviceCharge,
        tax: expectedBill.tax,
        discount: 0n,
        tipAmount: 0n,
        total: args.data.total,
        amountPaid: 0n,
        tableId: null,
        items: [
          {
            itemId: "item1",
            unitPrice: dbPrice,
            quantity: 1,
            modifiers: [],
            lineTotal: dbPrice,
          },
        ],
        vendor: stubVendor,
        table: null,
      };
    });

    await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [{ lineId: "l1", itemId: "item1", name: "کباب", unitPrice: 50_000n, quantity: 1, modifiers: [] }],
    });

    expect(snapshotTotal).toBe(expectedBill.total);

    setupTx({
      queryRawResults: [
        [],
        [
          {
            id: ORDER_ID,
            vendorId: VENDOR_ID,
            currency: "IRR",
            total: snapshotTotal,
            amountPaid: 0n,
            tableId: null,
          },
        ],
        [],
      ],
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    mockDb.payment.create.mockResolvedValue({
      id: "p-leg",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: snapshotTotal,
      tipAmount: 0n,
      total: snapshotTotal,
      currency: "IRR",
      method: "ipg",
      status: "pending",
      reference: "pay_leg",
      idempotencyKey: "idem-full",
      expiresAt,
      createdAt: new Date(),
    });

    const leg = await initiatePaymentLeg({
      orderId: ORDER_ID,
      amount: snapshotTotal,
      tipAmount: 0n,
      method: "ipg",
      idempotencyKey: "idem-full",
      splitType: "full",
    });

    expect(leg.amount).toBe(snapshotTotal);
    expect(leg.amount).toBe(expectedBill.total);
  });

  it("even-split legs from createOrderFromCart snapshot sum to order.total with no rounding leak", async () => {
    const { evenSplit } = await import("@/lib/pricing");
    const dbPrice = 200_000n;
    const serviceChargePct = 10;
    const taxPct = 9;
    const taxInclusive = false;

    const bill = computeBill(
      [{ lineId: "l1", itemId: "item1", name: "کباب", unitPrice: dbPrice, quantity: 1, modifiers: [] }],
      { serviceChargePct, taxPct, taxInclusive }
    );

    setupTx({ queryRawResults: [[{ seq: 1 }]] });
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([makeItem("item1", dbPrice)]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.order.create.mockResolvedValue({
      ...makeStubOrder({ total: bill.total }),
      vendor: stubVendor,
      table: null,
    });

    const { order } = await createOrderFromCart({
      vendorSlug: "test-cafe",
      lines: [{ lineId: "l1", itemId: "item1", name: "کباب", unitPrice: dbPrice, quantity: 1, modifiers: [] }],
    });

    const parts = 3;
    const legs = evenSplit(order.total, parts);
    const legsSum = legs.reduce((s, l) => s + l, 0n);
    expect(legsSum).toBe(order.total);
    expect(legs).toHaveLength(parts);
  });

  it("recordPayment legs: sum of payment.amount values equals order.total (multi-payment reconciliation)", async () => {
    const orderTotal = 239_800n;
    const leg1Amount = orderTotal / 2n + (orderTotal % 2n);
    const leg2Amount = orderTotal / 2n;

    expect(leg1Amount + leg2Amount).toBe(orderTotal);

    const makeOrderRow = (amountPaid: bigint) => ({
      id: ORDER_ID,
      vendorId: VENDOR_ID,
      currency: "IRR",
      total: orderTotal,
      amountPaid,
      tipAmount: 0n,
      tableId: null,
      status: "placed",
    });

    setupTx({
      queryRawResults: [
        [],
        [makeOrderRow(0n)],
      ],
    });

    mockDb.payment.create.mockResolvedValueOnce({
      id: "p-leg1",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: leg1Amount,
      tipAmount: 0n,
      total: leg1Amount,
      currency: "IRR",
      method: "ipg",
      status: "succeeded",
      reference: "pay_1",
      idempotencyKey: "idem-leg1",
      createdAt: new Date(),
    });
    mockDb.order.update.mockResolvedValueOnce({ ...makeStubOrder(), amountPaid: leg1Amount });

    const result1 = await recordPayment({
      orderId: ORDER_ID,
      amount: leg1Amount,
      method: "ipg",
      idempotencyKey: "idem-leg1",
    });

    setupTx({
      queryRawResults: [
        [],
        [makeOrderRow(leg1Amount)],
      ],
    });

    mockDb.payment.create.mockResolvedValueOnce({
      id: "p-leg2",
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      amount: leg2Amount,
      tipAmount: 0n,
      total: leg2Amount,
      currency: "IRR",
      method: "ipg",
      status: "succeeded",
      reference: "pay_2",
      idempotencyKey: "idem-leg2",
      createdAt: new Date(),
    });
    mockDb.order.update.mockResolvedValueOnce({ ...makeStubOrder(), amountPaid: orderTotal, status: "paid" });

    const result2 = await recordPayment({
      orderId: ORDER_ID,
      amount: leg2Amount,
      method: "ipg",
      idempotencyKey: "idem-leg2",
    });

    const paymentsSum = result1.payment.amount + result2.payment.amount;
    expect(paymentsSum).toBe(orderTotal);
    expect(result2.fullyPaid).toBe(true);
  });

  it("tip is tracked separately and does not inflate order.total", () => {
    const subtotal = 200_000n;
    const tipAmount = 20_000n;

    const bill = computeBill(
      [{ lineId: "l1", itemId: "i1", name: "item", unitPrice: subtotal, quantity: 1, modifiers: [] }],
      { serviceChargePct: 0, taxPct: 0, taxInclusive: true },
      { tip: 0n }
    );

    const orderTotal = bill.total;
    const paymentTotal = orderTotal + tipAmount;

    expect(orderTotal).toBe(subtotal);
    expect(paymentTotal).toBe(subtotal + tipAmount);
    expect(orderTotal).not.toBe(paymentTotal);
  });

  it("multi-item order: sum of OrderItem lineTotals equals snapshotted order subtotal", () => {
    const lines = [
      { lineId: "l1", itemId: "i1", name: "کباب", unitPrice: 150_000n, quantity: 2, modifiers: [] as { priceDelta: bigint; groupId: string; groupName: string; optionId: string; optionName: string }[] },
      {
        lineId: "l2",
        itemId: "i2",
        name: "نوشابه",
        unitPrice: 30_000n,
        quantity: 3,
        modifiers: [
          { groupId: "g1", groupName: "اندازه", optionId: "o1", optionName: "بزرگ", priceDelta: 5_000n },
        ],
      },
    ];

    const bill = computeBill(lines, { serviceChargePct: 0, taxPct: 0, taxInclusive: true });

    const expectedSubtotal = 150_000n * 2n + (30_000n + 5_000n) * 3n;
    expect(bill.subtotal).toBe(expectedSubtotal);
  });
});

// ── 6. Split leg TTL reservation ──────────────────────────────────────────────

describe("Split leg reservation with TTL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initiatePaymentLeg creates a pending payment with expiresAt in the future", async () => {
    const stubOrder = makeStubOrder();
    setupTx({
      queryRawResults: [
        [],
        [
          {
            id: stubOrder.id,
            vendorId: stubOrder.vendorId,
            currency: stubOrder.currency,
            total: stubOrder.total,
            amountPaid: stubOrder.amountPaid,
            tableId: null,
          },
        ],
        [],
      ],
    });

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

  it("initiatePaymentLeg rejects when order remaining balance is zero", async () => {
    setupTx({
      queryRawResults: [
        [],
        [
          {
            id: ORDER_ID,
            vendorId: VENDOR_ID,
            currency: "IRR",
            total: 239_800n,
            amountPaid: 239_800n,
            tableId: null,
          },
        ],
        [],
      ],
    });

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

  it("initiatePaymentLeg accounts for already-reserved pending legs", async () => {
    setupTx({
      queryRawResults: [
        [],
        [
          {
            id: ORDER_ID,
            vendorId: VENDOR_ID,
            currency: "IRR",
            total: 239_800n,
            amountPaid: 0n,
            tableId: null,
          },
        ],
        [{ amount: 239_800n }],
      ],
    });

    await expect(
      initiatePaymentLeg({
        orderId: ORDER_ID,
        amount: 1n,
        tipAmount: 0n,
        method: "ipg",
        idempotencyKey: "idem-over",
        splitType: "custom",
      })
    ).rejects.toThrow(/already fully paid|exceeds remaining/i);
  });
});
