/**
 * orders-payment-invariant.test.ts
 *
 * Tests the real recordPayment, initiatePayment, and confirmPendingPayment
 * functions from orders.ts with a mocked Prisma client.
 *
 * P0 requirement (round-3 review): the invariant test must exercise the
 * actual code path — not a re-implementation — so that the FOR UPDATE lock,
 * the remaining-balance check, and validatePaymentLegsAgainstSnapshot are
 * all covered by the same test that runs in CI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { evenSplit } from "@/lib/pricing";

vi.mock("@/lib/db", () => {
  const mockTx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    payment: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    diningTable: {
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const db = {
    payment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
    },
    order: {
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx)
    ),
    _mockTx: mockTx,
  };

  return { db };
});

import { db } from "@/lib/db";
import { recordPayment, initiatePayment, confirmPendingPayment } from "@/lib/orders";

const mockDb = db as typeof db & { _mockTx: ReturnType<typeof buildMockTx> };

function buildMockTx() {
  return (db as unknown as { _mockTx: Record<string, unknown> })._mockTx as {
    $queryRaw: ReturnType<typeof vi.fn>;
    order: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    payment: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    diningTable: { update: ReturnType<typeof vi.fn> };
  };
}

function makeOrder(overrides: {
  total?: bigint;
  amountPaid?: bigint;
  tipAmount?: bigint;
  payments?: Array<{ status: string; amount: bigint; tipAmount: bigint }>;
  tableId?: string | null;
}) {
  return {
    id: "order-1",
    vendorId: "vendor-1",
    currency: "IRR",
    total: overrides.total ?? 30_000n,
    amountPaid: overrides.amountPaid ?? 0n,
    tipAmount: overrides.tipAmount ?? 0n,
    status: "placed",
    tableId: overrides.tableId ?? null,
    payments: (overrides.payments ?? []).map((p, i) => ({
      id: `pay-existing-${i}`,
      ...p,
    })),
    items: [],
  };
}

function makeCreatedPayment(amount: bigint, tip: bigint, status = "succeeded") {
  return {
    id: "pay-new-1",
    orderId: "order-1",
    vendorId: "vendor-1",
    amount,
    tipAmount: tip,
    total: amount + tip,
    status,
    currency: "IRR",
    method: "cash",
    splitType: "full",
    idempotencyKey: "idem-1",
    expiresAt: null,
    verifiedAt: status === "succeeded" ? new Date() : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (db.payment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  const tx = buildMockTx();
  tx.$queryRaw.mockResolvedValue([]);
  tx.order.update.mockResolvedValue({});
  tx.diningTable.update.mockResolvedValue({});
  tx.payment.findUnique.mockResolvedValue(null);
});

describe("recordPayment — real implementation", () => {
  it("creates a succeeded payment and marks order fully paid for a full payment", async () => {
    const orderTotal = 30_000n;
    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.create.mockResolvedValue(makeCreatedPayment(orderTotal, 0n));

    const result = await recordPayment({
      orderId: "order-1",
      amount: orderTotal,
      method: "cash",
      idempotencyKey: "idem-1",
    });

    expect(result.fullyPaid).toBe(true);
    expect(result.amountPaid).toBe(orderTotal);
    expect(result.deduplicated).toBe(false);
    expect(tx.payment.create).toHaveBeenCalledOnce();
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid" }),
      })
    );
  });

  it("creates a partial succeeded payment without closing the order", async () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.create.mockResolvedValue(makeCreatedPayment(legs[0], 0n));

    const result = await recordPayment({
      orderId: "order-1",
      amount: legs[0],
      method: "cash",
      idempotencyKey: "idem-1",
    });

    expect(result.fullyPaid).toBe(false);
    expect(result.amountPaid).toBe(legs[0]);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "placed" }),
      })
    );
  });

  it("accepts the second leg of a three-way even split (invariant not violated)", async () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const order = makeOrder({
      total: orderTotal,
      amountPaid: legs[0],
      payments: [{ status: "succeeded", amount: legs[0], tipAmount: 0n }],
    });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.create.mockResolvedValue(makeCreatedPayment(legs[1], 0n));

    const result = await recordPayment({
      orderId: "order-1",
      amount: legs[1],
      method: "cash",
      idempotencyKey: "idem-2",
    });

    expect(result.fullyPaid).toBe(false);
    expect(result.amountPaid).toBe(legs[0] + legs[1]);
  });

  it("rejects a leg that exceeds remaining balance (before invariant check)", async () => {
    const orderTotal = 20_000n;
    const order = makeOrder({
      total: orderTotal,
      amountPaid: 15_000n,
      payments: [{ status: "succeeded", amount: 15_000n, tipAmount: 0n }],
    });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);

    await expect(
      recordPayment({
        orderId: "order-1",
        amount: 10_000n,
        method: "cash",
        idempotencyKey: "idem-overflow",
      })
    ).rejects.toThrow(/exceeds remaining balance/);

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a client-tampered amount that would cause overpayment (invariant guard)", async () => {
    const orderTotal = 20_000n;
    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);

    await expect(
      recordPayment({
        orderId: "order-1",
        amount: 999_999n,
        method: "cash",
        idempotencyKey: "idem-tampered",
      })
    ).rejects.toThrow(/exceeds remaining balance/);

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("deduplicates on idempotency key — returns existing payment without writing", async () => {
    const existingPayment = makeCreatedPayment(30_000n, 0n);
    (db.payment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingPayment);
    (db.order.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOrder({ total: 30_000n, amountPaid: 30_000n })
    );

    const result = await recordPayment({
      orderId: "order-1",
      amount: 30_000n,
      method: "cash",
      idempotencyKey: "idem-1",
    });

    expect(result.deduplicated).toBe(true);
    expect(result.payment.id).toBe(existingPayment.id);
    const tx = buildMockTx();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("issues a FOR UPDATE lock inside the transaction", async () => {
    const orderTotal = 10_000n;
    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.create.mockResolvedValue(makeCreatedPayment(orderTotal, 0n));

    await recordPayment({
      orderId: "order-1",
      amount: orderTotal,
      method: "cash",
      idempotencyKey: "idem-lock",
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    const rawCall = tx.$queryRaw.mock.calls[0][0];
    const sqlParts: string[] = Array.isArray(rawCall)
      ? (rawCall as unknown[]).map(String)
      : [String(rawCall)];
    expect(sqlParts.join("").toLowerCase()).toContain("for update");
  });

  it("releases dining table when order becomes fully paid", async () => {
    const orderTotal = 10_000n;
    const order = makeOrder({ total: orderTotal, tableId: "table-1" });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.create.mockResolvedValue(makeCreatedPayment(orderTotal, 0n));

    await recordPayment({
      orderId: "order-1",
      amount: orderTotal,
      method: "cash",
      idempotencyKey: "idem-table",
    });

    expect(tx.diningTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "available" },
      })
    );
  });
});

describe("initiatePayment — real implementation", () => {
  it("creates a pending payment with expiresAt set (TTL reservation)", async () => {
    const orderTotal = 30_000n;
    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    const pendingPayment = { ...makeCreatedPayment(orderTotal, 0n, "pending"), expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
    tx.payment.create.mockResolvedValue(pendingPayment);

    const result = await initiatePayment({
      orderId: "order-1",
      amount: orderTotal,
      method: "cash",
      idempotencyKey: "idem-init",
    });

    expect(result.deduplicated).toBe(false);
    expect(result.payment.status).toBe("pending");
    expect(result.payment.expiresAt).toBeTruthy();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it("reserves only the available balance (subtracts already-succeeded + active-reserved)", async () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 10 * 60 * 1000);

    const order = makeOrder({
      total: orderTotal,
      payments: [
        { status: "succeeded", amount: legs[0], tipAmount: 0n },
        { status: "pending", amount: legs[1], tipAmount: 0n },
      ],
    });
    (order.payments[1] as unknown as { expiresAt: Date }).expiresAt = futureExpiry;

    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    const pendingPayment = { ...makeCreatedPayment(legs[2], 0n, "pending"), expiresAt: futureExpiry };
    tx.payment.create.mockResolvedValue(pendingPayment);

    const result = await initiatePayment({
      orderId: "order-1",
      amount: legs[2],
      method: "cash",
      idempotencyKey: "idem-third",
    });

    expect(result.payment.status).toBe("pending");
    expect(tx.payment.create).toHaveBeenCalledOnce();
  });

  it("rejects an amount that exceeds remaining after subtracting reserved legs", async () => {
    const orderTotal = 20_000n;
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 10 * 60 * 1000);
    const order = makeOrder({
      total: orderTotal,
      payments: [{ status: "pending", amount: 15_000n, tipAmount: 0n }],
    });
    (order.payments[0] as unknown as { expiresAt: Date }).expiresAt = futureExpiry;

    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);

    await expect(
      initiatePayment({
        orderId: "order-1",
        amount: 10_000n,
        method: "cash",
        idempotencyKey: "idem-over",
      })
    ).rejects.toThrow(/exceeds remaining balance/);

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("deduplicates on idempotency key", async () => {
    const existingPayment = { ...makeCreatedPayment(30_000n, 0n, "pending"), expiresAt: new Date() };
    (db.payment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingPayment);

    const result = await initiatePayment({
      orderId: "order-1",
      amount: 30_000n,
      method: "cash",
      idempotencyKey: "idem-dup",
    });

    expect(result.deduplicated).toBe(true);
    expect(result.payment.id).toBe(existingPayment.id);
    const tx = buildMockTx();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe("confirmPendingPayment — real implementation", () => {
  it("upgrades a pending payment to succeeded and updates order amountPaid", async () => {
    const orderTotal = 30_000n;
    const pendingPayment = { ...makeCreatedPayment(orderTotal, 0n, "pending"), expiresAt: new Date() };
    (db.payment.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(pendingPayment);

    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    const confirmedPayment = makeCreatedPayment(orderTotal, 0n, "succeeded");
    tx.payment.update.mockResolvedValue(confirmedPayment);

    const result = await confirmPendingPayment("pay-new-1");

    expect(result.fullyPaid).toBe(true);
    expect(result.amountPaid).toBe(orderTotal);
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "succeeded" }),
      })
    );
  });

  it("validates the invariant during confirm — rejects if overpayment would occur", async () => {
    const orderTotal = 10_000n;
    const pendingPayment = { ...makeCreatedPayment(20_000n, 0n, "pending"), expiresAt: new Date() };
    (db.payment.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(pendingPayment);

    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);

    await expect(confirmPendingPayment("pay-new-1")).rejects.toThrow(/[Ii]nvariant/);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it("issues a FOR UPDATE lock during confirm", async () => {
    const orderTotal = 10_000n;
    const pendingPayment = { ...makeCreatedPayment(orderTotal, 0n, "pending"), expiresAt: new Date() };
    (db.payment.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(pendingPayment);

    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.update.mockResolvedValue(makeCreatedPayment(orderTotal, 0n));

    await confirmPendingPayment("pay-new-1");

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    const rawCall = tx.$queryRaw.mock.calls[0][0];
    const sqlParts: string[] = Array.isArray(rawCall)
      ? (rawCall as unknown[]).map(String)
      : [String(rawCall)];
    expect(sqlParts.join("").toLowerCase()).toContain("for update");
  });

  it("returns alreadyConfirmed=true without re-writing if payment is already succeeded", async () => {
    const succeededPayment = makeCreatedPayment(10_000n, 0n, "succeeded");
    (db.payment.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(succeededPayment);
    (db.order.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOrder({ total: 10_000n, amountPaid: 10_000n })
    );

    const result = await confirmPendingPayment("pay-new-1");

    expect(result.alreadyConfirmed).toBe(true);
    const tx = buildMockTx();
    expect(tx.payment.update).not.toHaveBeenCalled();
  });
});

describe("initiatePayment + confirmPendingPayment — two-step reserve-and-settle path", () => {
  it("full-payment: reserve then confirm results in fullyPaid=true", async () => {
    const orderTotal = 30_000n;
    const order = makeOrder({ total: orderTotal });
    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    const pending = { ...makeCreatedPayment(orderTotal, 0n, "pending"), expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
    tx.payment.create.mockResolvedValue(pending);

    const { payment: pendingPayment } = await initiatePayment({
      orderId: "order-1",
      amount: orderTotal,
      method: "cash",
      idempotencyKey: "idem-full",
    });
    expect(pendingPayment.status).toBe("pending");

    (db.payment.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(pendingPayment);
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.payment.update.mockResolvedValue(makeCreatedPayment(orderTotal, 0n, "succeeded"));

    const confirmed = await confirmPendingPayment(pendingPayment.id);
    expect(confirmed.fullyPaid).toBe(true);
    expect(confirmed.amountPaid).toBe(orderTotal);
  });

  it("split leg: each reservation holds balance preventing concurrent over-reservation", async () => {
    const orderTotal = 30_000n;
    const legs = evenSplit(orderTotal, 3);
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 15 * 60 * 1000);

    const orderWithTwoReserved = makeOrder({
      total: orderTotal,
      payments: [
        { status: "pending", amount: legs[0], tipAmount: 0n },
        { status: "pending", amount: legs[1], tipAmount: 0n },
      ],
    });
    (orderWithTwoReserved.payments[0] as unknown as { expiresAt: Date }).expiresAt = futureExpiry;
    (orderWithTwoReserved.payments[1] as unknown as { expiresAt: Date }).expiresAt = futureExpiry;

    const tx = buildMockTx();
    tx.order.findUniqueOrThrow.mockResolvedValue(orderWithTwoReserved);

    await expect(
      initiatePayment({
        orderId: "order-1",
        amount: legs[2] + 1n,
        method: "cash",
        idempotencyKey: "idem-over-reserve",
      })
    ).rejects.toThrow(/exceeds remaining balance/);
  });
});
