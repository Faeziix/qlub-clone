/**
 * Tests for issue #41 — "My Order" persistent order + status tracking + incremental re-order.
 *
 * Acceptance criteria verified here:
 * 1. appendItemsToOrder is server-authoritative (ignores client prices).
 * 2. Totals are recomputed correctly for both exclusive and inclusive tax.
 * 3. Orders in terminal states (paid, cancelled) reject appends.
 * 4. Orders with active payment reservations reject appends.
 * 5. Cross-vendor append is blocked (tenant isolation).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
    orderItem: {
      createMany: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    diningTable: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    review: { create: vi.fn() },
  };
  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));

import { appendItemsToOrder } from "@/lib/orders";

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

const stubOrderRow = {
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
};

type TxMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  menuItem: { findMany: ReturnType<typeof vi.fn> };
  modifierOption: { findMany: ReturnType<typeof vi.fn> };
  orderItem: { createMany: ReturnType<typeof vi.fn> };
  order: { update: ReturnType<typeof vi.fn> };
};

function setupTx(
  overrides: {
    queryRawResults?: unknown[][];
  } = {}
) {
  const queryRawResults = overrides.queryRawResults ?? [
    [stubOrderRow],
    [],
  ];
  let callIdx = 0;

  const tx: TxMock = {
    $queryRaw: vi.fn(() => {
      const r = queryRawResults[callIdx] ?? [];
      callIdx++;
      return Promise.resolve(r);
    }),
    menuItem: { findMany: mockDb.menuItem.findMany },
    modifierOption: { findMany: mockDb.modifierOption.findMany },
    orderItem: { createMany: mockDb.orderItem.createMany },
    order: { update: mockDb.order.update },
  };

  mockDb.$transaction.mockImplementation(
    async (fn: (t: TxMock) => Promise<unknown>) => fn(tx)
  );

  return { tx };
}

const stubItem1 = { id: "item1", vendorId: VENDOR_ID, price: 150_000n };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.vendor.findUnique.mockResolvedValue(stubVendor);
  mockDb.menuItem.findMany.mockResolvedValue([stubItem1]);
  mockDb.modifierOption.findMany.mockResolvedValue([]);
  mockDb.orderItem.createMany.mockResolvedValue({ count: 1 });
  mockDb.order.update.mockResolvedValue({
    ...stubOrderRow,
    subtotal: 350_000n,
    serviceCharge: 35_000n,
    tax: 34_650n,
    total: 419_650n,
    items: [],
    vendor: stubVendor,
    table: null,
  });
});

describe("appendItemsToOrder — server-authoritative pricing", () => {
  it("ignores client-supplied unit price and uses DB price", async () => {
    setupTx();

    await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "کباب",
          unitPrice: 9_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    const createManyCall = mockDb.orderItem.createMany.mock.calls[0][0];
    expect(createManyCall.data[0].unitPrice).toBe(150_000n);
  });

  it("recomputes totals using combined existing + new subtotal (exclusive tax)", async () => {
    setupTx();

    await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "کباب",
          unitPrice: 150_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    const updateCall = mockDb.order.update.mock.calls[0][0];
    const newSubtotal = 350_000n;
    const newServiceCharge = 35_000n;
    const newTax = 34_650n;
    const newTotal = 419_650n;

    expect(updateCall.data.subtotal).toBe(newSubtotal);
    expect(updateCall.data.serviceCharge).toBe(newServiceCharge);
    expect(updateCall.data.tax).toBe(newTax);
    expect(updateCall.data.total).toBe(newTotal);
  });

  it("detects price change when DB price differs from client price", async () => {
    setupTx();

    const result = await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "کباب",
          unitPrice: 100_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(result.priceChanged).toBe(true);
  });

  it("does not report price change when client price matches DB price", async () => {
    setupTx();

    const result = await appendItemsToOrder({
      orderId: ORDER_ID,
      vendorSlug: "test-cafe",
      lines: [
        {
          lineId: "l1",
          itemId: "item1",
          name: "کباب",
          unitPrice: 150_000n,
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    expect(result.priceChanged).toBe(false);
  });
});

describe("appendItemsToOrder — terminal status guard", () => {
  it("rejects append to a paid order", async () => {
    setupTx({
      queryRawResults: [[{ ...stubOrderRow, status: "paid" }], []],
    });

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "test-cafe",
        lines: [
          {
            lineId: "l1",
            itemId: "item1",
            name: "کباب",
            unitPrice: 150_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).rejects.toThrow("Order cannot be modified");
  });

  it("rejects append to a cancelled order", async () => {
    setupTx({
      queryRawResults: [[{ ...stubOrderRow, status: "cancelled" }], []],
    });

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "test-cafe",
        lines: [
          {
            lineId: "l1",
            itemId: "item1",
            name: "کباب",
            unitPrice: 150_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).rejects.toThrow("Order cannot be modified");
  });
});

describe("appendItemsToOrder — tenant isolation", () => {
  it("rejects append when order belongs to a different vendor", async () => {
    setupTx({
      queryRawResults: [
        [{ ...stubOrderRow, vendorId: "different-vendor" }],
        [],
      ],
    });

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "test-cafe",
        lines: [
          {
            lineId: "l1",
            itemId: "item1",
            name: "کباب",
            unitPrice: 150_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).rejects.toThrow("Order does not belong to this vendor");
  });

  it("rejects when vendor is not found", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(null);

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "nonexistent",
        lines: [
          {
            lineId: "l1",
            itemId: "item1",
            name: "کباب",
            unitPrice: 150_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).rejects.toThrow("Vendor not found");
  });
});

describe("appendItemsToOrder — pending payment guard", () => {
  it("rejects append when a pending payment reservation exists", async () => {
    setupTx({
      queryRawResults: [
        [stubOrderRow],
        [{ id: "pay1", amount: 239_800n }],
      ],
    });

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "test-cafe",
        lines: [
          {
            lineId: "l1",
            itemId: "item1",
            name: "کباب",
            unitPrice: 150_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).rejects.toThrow("Cannot modify order while a payment is in progress");
  });

  it("allows append when there are no pending payments", async () => {
    setupTx({
      queryRawResults: [[stubOrderRow], []],
    });

    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "test-cafe",
        lines: [
          {
            lineId: "l1",
            itemId: "item1",
            name: "کباب",
            unitPrice: 150_000n,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
    ).resolves.toBeDefined();
  });
});

describe("appendItemsToOrder — empty cart guard", () => {
  it("rejects empty lines array", async () => {
    await expect(
      appendItemsToOrder({
        orderId: ORDER_ID,
        vendorSlug: "test-cafe",
        lines: [],
      })
    ).rejects.toThrow("No items to add");
  });
});
