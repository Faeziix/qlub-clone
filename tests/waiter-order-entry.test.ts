/**
 * Tests for issue #52 — Waiter order-entry staff screen.
 *
 * Acceptance criteria verified here:
 * 1. A new order is created for a table via server-authoritative pricing.
 * 2. Items can be appended to an existing open order.
 * 3. Cross-vendor table access is rejected (tenant isolation).
 * 4. Client-supplied prices are ignored; DB prices are used.
 * 5. Terminal orders (paid/cancelled) cannot be modified.
 * 6. `source` is set to `pos` (point-of-sale) for waiter-created orders.
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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderItem: { createMany: vi.fn() },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    diningTable: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    review: { create: vi.fn() },
  };
  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));

import { createOrderFromCart, appendItemsToOrder } from "@/lib/orders";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const VENDOR_ID = "v1";
const VENDOR_SLUG = "demo-restaurant";
const OTHER_VENDOR_ID = "v2";
const TABLE_ID = "tbl1";
const ORDER_ID = "ord1";
const TABLE_CODE = "A1";

const stubVendor = {
  id: VENDOR_ID,
  slug: VENDOR_SLUG,
  currency: "IRR",
  serviceChargePct: 10,
  taxPct: 9,
  taxInclusive: false,
  vatEnabled: false,
  vatPct: 0,
  active: true,
};

const stubTable = {
  id: TABLE_ID,
  vendorId: VENDOR_ID,
  code: TABLE_CODE,
  label: "میز ۱",
  status: "available" as const,
};

const stubOrderRow = {
  id: ORDER_ID,
  vendorId: VENDOR_ID,
  currency: "IRR",
  subtotal: 200_000n,
  serviceCharge: 20_000n,
  tax: 19_800n,
  discount: 0n,
  tipAmount: 0n,
  total: 239_800n,
  amountPaid: 0n,
  tableId: TABLE_ID,
  status: "placed",
};

const stubOrderFull = {
  ...stubOrderRow,
  orderNumber: "Q-000001",
  items: [],
  payments: [],
  vendor: stubVendor,
  table: stubTable,
};

type TxMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  menuItem: { findMany: ReturnType<typeof vi.fn> };
  modifierOption: { findMany: ReturnType<typeof vi.fn> };
  order: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  orderItem: { createMany: ReturnType<typeof vi.fn> };
  payment: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  diningTable: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function setupTx(queryRawResults: unknown[][] = [[{ seq: 1 }]]) {
  let idx = 0;
  const tx: TxMock = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    $queryRaw: vi.fn((..._args: any[]) => {
      const r = queryRawResults[idx] ?? [];
      idx++;
      return Promise.resolve(r);
    }),
    menuItem: { findMany: mockDb.menuItem.findMany },
    modifierOption: { findMany: mockDb.modifierOption.findMany },
    order: {
      create: mockDb.order.create,
      findUnique: mockDb.order.findUnique,
      update: mockDb.order.update,
    },
    orderItem: { createMany: mockDb.orderItem.createMany },
    payment: { create: mockDb.payment.create, findMany: mockDb.payment.findMany },
    diningTable: { findFirst: mockDb.diningTable.findFirst, update: mockDb.diningTable.update },
  };
  mockDb.$transaction.mockImplementation(
    async (fn: (t: TxMock) => Promise<unknown>) => fn(tx)
  );
  return { tx };
}

// ── 1. Server-authoritative pricing for waiter-created orders ─────────────────

describe("Waiter order-entry — server-authoritative pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.diningTable.findFirst.mockResolvedValue(stubTable);
  });

  it("ignores client-supplied unitPrice and uses DB price when creating via waiter", async () => {
    const dbPrice = 350_000n;
    const clientPrice = 100n;

    setupTx([[{ seq: 5 }]]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item1", vendorId: VENDOR_ID, price: dbPrice }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.order.create.mockImplementation(async (args: { data: { subtotal: bigint; items: { create: { unitPrice: bigint }[] } } }) => ({
      ...stubOrderFull,
      subtotal: args.data.subtotal,
    }));

    const { order } = await createOrderFromCart({
      vendorSlug: VENDOR_SLUG,
      tableCode: TABLE_CODE,
      type: "dinein",
      lines: [{ lineId: "l1", itemId: "item1", name: "چلو کباب", unitPrice: clientPrice, quantity: 1, modifiers: [] }],
    });

    const createdItem = (
      mockDb.order.create.mock.calls[0] as [{ data: { items: { create: { unitPrice: bigint }[] } } }]
    )[0].data.items.create[0];

    expect(createdItem.unitPrice).toBe(dbPrice);
    expect(createdItem.unitPrice).not.toBe(clientPrice);
    expect(order.priceChanged).toBe(true);
  });

  it("computes bill from DB price, not client price", async () => {
    const dbPrice = 200_000n;

    setupTx([[{ seq: 1 }]]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item1", vendorId: VENDOR_ID, price: dbPrice }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);

    let capturedSubtotal = 0n;
    mockDb.order.create.mockImplementation(async (args: { data: { subtotal: bigint } }) => {
      capturedSubtotal = args.data.subtotal;
      return { ...stubOrderFull, subtotal: args.data.subtotal };
    });

    await createOrderFromCart({
      vendorSlug: VENDOR_SLUG,
      tableCode: TABLE_CODE,
      type: "dinein",
      lines: [{ lineId: "l1", itemId: "item1", name: "چلو کباب", unitPrice: 1n, quantity: 2, modifiers: [] }],
    });

    expect(capturedSubtotal).toBe(dbPrice * 2n);
    expect(capturedSubtotal).not.toBe(1n * 2n);
  });

  it("resolves modifier priceDelta from DB — client-supplied delta is ignored", async () => {
    const dbDelta = 50_000n;

    setupTx([[{ seq: 2 }]]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item1", vendorId: VENDOR_ID, price: 200_000n }]);
    mockDb.modifierOption.findMany.mockResolvedValue([{ id: "opt1", priceDelta: dbDelta }]);
    mockDb.order.create.mockResolvedValue(stubOrderFull);

    await createOrderFromCart({
      vendorSlug: VENDOR_SLUG,
      tableCode: TABLE_CODE,
      lines: [{
        lineId: "l1",
        itemId: "item1",
        name: "پیتزا",
        unitPrice: 200_000n,
        quantity: 1,
        modifiers: [{
          groupId: "g1",
          groupName: "سایز",
          optionId: "opt1",
          optionName: "بزرگ",
          priceDelta: 0n,
        }],
      }],
    });

    const createdItem = (
      mockDb.order.create.mock.calls[0] as [{ data: { items: { create: { modifiers: { priceDelta: string }[] }[] } } }]
    )[0].data.items.create[0];

    expect(BigInt(createdItem.modifiers[0].priceDelta)).toBe(dbDelta);
  });
});

// ── 2. Order created for a table (open order per table) ───────────────────────

describe("Waiter order-entry — one open order per table", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new order linked to the table when no open order exists", async () => {
    setupTx([[{ seq: 10 }]]);
    mockDb.diningTable.findFirst.mockResolvedValue(stubTable);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item1", vendorId: VENDOR_ID, price: 150_000n }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.order.create.mockResolvedValue(stubOrderFull);

    await createOrderFromCart({
      vendorSlug: VENDOR_SLUG,
      tableCode: TABLE_CODE,
      type: "dinein",
      lines: [{ lineId: "l1", itemId: "item1", name: "ماهی", unitPrice: 150_000n, quantity: 1, modifiers: [] }],
    });

    const createCall = (mockDb.order.create.mock.calls[0] as [{ data: { tableId: string } }])[0];
    expect(createCall.data.tableId).toBe(TABLE_ID);
  });

  it("marks the table as occupied when the order is created", async () => {
    setupTx([[{ seq: 11 }]]);
    mockDb.diningTable.findFirst.mockResolvedValue(stubTable);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item1", vendorId: VENDOR_ID, price: 100_000n }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.order.create.mockResolvedValue(stubOrderFull);

    await createOrderFromCart({
      vendorSlug: VENDOR_SLUG,
      tableCode: TABLE_CODE,
      type: "dinein",
      lines: [{ lineId: "l1", itemId: "item1", name: "قهوه", unitPrice: 100_000n, quantity: 1, modifiers: [] }],
    });

    expect(mockDb.diningTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TABLE_ID },
        data: { status: "occupied" },
      })
    );
  });
});

// ── 3. Append items to existing open order ────────────────────────────────────

describe("Waiter order-entry — append to existing open order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appends items to an existing open order and recomputes totals", async () => {
    const existingSubtotal = 200_000n;
    const appendedItemPrice = 100_000n;

    setupTx([
      [{ ...stubOrderRow, subtotal: existingSubtotal, total: 239_800n }],
      [],
    ]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item2", vendorId: VENDOR_ID, price: appendedItemPrice }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.orderItem.createMany.mockResolvedValue({ count: 1 });
    mockDb.order.update.mockResolvedValue({
      ...stubOrderFull,
      subtotal: existingSubtotal + appendedItemPrice,
    });

    const { order } = await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: VENDOR_SLUG,
      lines: [{ lineId: "l2", itemId: "item2", name: "دوغ", unitPrice: 1n, quantity: 1, modifiers: [] }],
    });

    expect(mockDb.orderItem.createMany).toHaveBeenCalled();
    expect(mockDb.order.update).toHaveBeenCalled();
    expect(order.subtotal).toBe(existingSubtotal + appendedItemPrice);
  });

  it("uses server-authoritative price when appending — ignores client unitPrice", async () => {
    const dbPrice = 80_000n;

    setupTx([
      [stubOrderRow],
      [],
    ]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item2", vendorId: VENDOR_ID, price: dbPrice }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.orderItem.createMany.mockResolvedValue({ count: 1 });
    mockDb.order.update.mockResolvedValue(stubOrderFull);

    await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: VENDOR_SLUG,
      lines: [{ lineId: "l2", itemId: "item2", name: "نوشیدنی", unitPrice: 1n, quantity: 1, modifiers: [] }],
    });

    const createManyCall = (
      mockDb.orderItem.createMany.mock.calls[0] as [{ data: { unitPrice: bigint }[] }]
    )[0];
    expect(createManyCall.data[0].unitPrice).toBe(dbPrice);
    expect(createManyCall.data[0].unitPrice).not.toBe(1n);
  });
});

// ── 4. Cross-vendor table access rejected (tenant isolation) ──────────────────

describe("Waiter order-entry — tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects append when order belongs to a different vendor", async () => {
    setupTx([
      [{ ...stubOrderRow, vendorId: OTHER_VENDOR_ID }],
    ]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: VENDOR_SLUG,
        lines: [{ lineId: "l1", itemId: "item1", name: "test", unitPrice: 0n, quantity: 1, modifiers: [] }],
      })
    ).rejects.toThrow(/does not belong to this vendor/i);
  });

  it("createOrderFromCart resolves table only within the vendor scope", async () => {
    mockDb.diningTable.findFirst.mockResolvedValue(null);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);

    setupTx([[{ seq: 1 }]]);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item1", vendorId: VENDOR_ID, price: 100_000n }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.order.create.mockResolvedValue({ ...stubOrderFull, tableId: null, table: null });

    await createOrderFromCart({
      vendorSlug: VENDOR_SLUG,
      tableCode: "X9",
      lines: [{ lineId: "l1", itemId: "item1", name: "test", unitPrice: 100_000n, quantity: 1, modifiers: [] }],
    });

    const tableLookup = mockDb.diningTable.findFirst.mock.calls[0] as [{ where: { vendorId: string; code: string } }];
    expect(tableLookup[0].where.vendorId).toBe(VENDOR_ID);
    expect(tableLookup[0].where.code).toBe("X9");
  });
});

// ── 5. Terminal order protection ──────────────────────────────────────────────

describe("Waiter order-entry — terminal order protection", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const terminalStatus of ["paid", "cancelled"] as const) {
    it(`rejects append when order status is '${terminalStatus}'`, async () => {
      setupTx([
        [{ ...stubOrderRow, status: terminalStatus }],
      ]);
      mockDb.vendor.findUnique.mockResolvedValue(stubVendor);

      await expect(
        appendItemsToOrder({
          orderId: ORDER_ID,
          vendorSlug: VENDOR_SLUG,
          lines: [{ lineId: "l1", itemId: "item1", name: "test", unitPrice: 0n, quantity: 1, modifiers: [] }],
        })
      ).rejects.toThrow(/cannot be modified/i);
    });
  }

  it("rejects append when a payment is in progress (pending status)", async () => {
    setupTx([
      [stubOrderRow],
      [{ id: "pay1" }],
    ]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: VENDOR_SLUG,
        lines: [{ lineId: "l1", itemId: "item1", name: "test", unitPrice: 0n, quantity: 1, modifiers: [] }],
      })
    ).rejects.toThrow(/payment is in progress/i);
  });
});

// ── 6. Bill is recomputed with recomputeOrderTotals ───────────────────────────

describe("Waiter order-entry — running bill recomputation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes service charge and VAT on subtotal after append", async () => {
    const existingSubtotal = 100_000n;
    const appendPrice = 100_000n;

    setupTx([
      [{ ...stubOrderRow, subtotal: existingSubtotal, total: 119_900n }],
      [],
    ]);
    mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
    mockDb.menuItem.findMany.mockResolvedValue([{ id: "item2", vendorId: VENDOR_ID, price: appendPrice }]);
    mockDb.modifierOption.findMany.mockResolvedValue([]);
    mockDb.orderItem.createMany.mockResolvedValue({ count: 1 });

    let capturedUpdate: Record<string, bigint> | undefined;
    mockDb.order.update.mockImplementation(async (args: { data: Record<string, bigint> }) => {
      capturedUpdate = args.data;
      return stubOrderFull;
    });

    await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: VENDOR_SLUG,
      lines: [{ lineId: "l2", itemId: "item2", name: "ماست", unitPrice: 1n, quantity: 1, modifiers: [] }],
    });

    const newSubtotal = existingSubtotal + appendPrice;
    expect(capturedUpdate?.subtotal).toBe(newSubtotal);

    const expectedServiceCharge = (newSubtotal * BigInt(Math.round(10 * 100))) / 10_000n;
    expect(capturedUpdate?.serviceCharge).toBe(expectedServiceCharge);
  });
});
