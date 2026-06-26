/**
 * Tests for issue #19 — SQL aggregation path in getDashboardStats.
 *
 * Verifies that getDashboardStats drives Prisma aggregate(_sum) and
 * groupBy(orderId) rather than fetching all payment rows and summing in JS.
 *
 * Revenue = _sum.amount  (tips excluded)
 * Tips    = _sum.tipAmount
 * Distinct order count = groupBy(['orderId']).length
 * avgOrder = revenueRial / distinctOrderCount (integer division)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockDb } = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockDb = {
    payment: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
    menuItem: {
      count: vi.fn(),
    },
    diningTable: {
      count: vi.fn(),
    },
    vendor: {
      findUnique: vi.fn(),
    },
  };
  return { mockGetSession, mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  requireSession: () => mockGetSession(),
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ get: vi.fn().mockReturnValue(undefined) }),
}));

import { getDashboardStats } from "@/lib/queries";

const VENDOR_ID = "v-test-001";

beforeEach(() => {
  vi.resetAllMocks();

  mockDb.order.findMany.mockResolvedValue([]);
  mockDb.review.findMany.mockResolvedValue([]);
  mockDb.menuItem.count.mockResolvedValue(0);
  mockDb.diningTable.count.mockResolvedValue(0);
  mockDb.payment.findMany.mockResolvedValue([]);
});

describe("getDashboardStats — SQL aggregation contract", () => {
  it("calls db.payment.aggregate with _sum.amount and _sum.tipAmount (not findMany for stats)", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 500_000n, tipAmount: 50_000n },
    });
    mockDb.payment.groupBy.mockResolvedValue([
      { orderId: "o1" },
      { orderId: "o2" },
    ]);

    await getDashboardStats(VENDOR_ID);

    expect(mockDb.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: expect.objectContaining({ amount: true, tipAmount: true }),
      })
    );
  });

  it("calls db.payment.groupBy with by: ['orderId'] to count distinct orders", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 0n, tipAmount: 0n },
    });
    mockDb.payment.groupBy.mockResolvedValue([]);

    await getDashboardStats(VENDOR_ID);

    expect(mockDb.payment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["orderId"],
      })
    );
  });

  it("returns revenue from _sum.amount (tips excluded)", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 300_000n, tipAmount: 30_000n },
    });
    mockDb.payment.groupBy.mockResolvedValue([{ orderId: "o1" }]);

    const stats = await getDashboardStats(VENDOR_ID);

    expect(stats.revenue).toBe(300_000);
    expect(stats.tips).toBe(30_000);
  });

  it("returns avgOrder as revenueRial / distinctOrderCount", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 600_000n, tipAmount: 0n },
    });
    mockDb.payment.groupBy.mockResolvedValue([
      { orderId: "o1" },
      { orderId: "o2" },
      { orderId: "o3" },
    ]);

    const stats = await getDashboardStats(VENDOR_ID);

    expect(stats.avgOrder).toBe(200_000);
  });

  it("returns avgOrder as 0 when no succeeded payments exist", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: null, tipAmount: null },
    });
    mockDb.payment.groupBy.mockResolvedValue([]);

    const stats = await getDashboardStats(VENDOR_ID);

    expect(stats.avgOrder).toBe(0);
  });

  it("aggregate is scoped to vendorId for tenant isolation", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 0n, tipAmount: 0n },
    });
    mockDb.payment.groupBy.mockResolvedValue([]);

    await getDashboardStats(VENDOR_ID);

    const calls = mockDb.payment.aggregate.mock.calls;
    for (const [args] of calls) {
      expect(args.where).toMatchObject({ vendorId: VENDOR_ID });
    }
  });

  it("aggregate is scoped to status 'succeeded' only", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 0n, tipAmount: 0n },
    });
    mockDb.payment.groupBy.mockResolvedValue([]);

    await getDashboardStats(VENDOR_ID);

    const calls = mockDb.payment.aggregate.mock.calls;
    for (const [args] of calls) {
      expect(args.where).toMatchObject({ status: "succeeded" });
    }
  });

  it("revenueDelta is a real number, not a static string", async () => {
    mockDb.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 120_000n, tipAmount: 0n } })
      .mockResolvedValueOnce({ _sum: { amount: 100_000n, tipAmount: 0n } });
    mockDb.payment.groupBy
      .mockResolvedValueOnce([{ orderId: "o1" }])
      .mockResolvedValueOnce([{ orderId: "o-prev" }]);

    const stats = await getDashboardStats(VENDOR_ID);

    expect(typeof stats.revenueDelta).toBe("number");
    expect(stats.revenueDelta).toBeCloseTo(20);
  });

  it("orderCountDelta is a real number, not a static string", async () => {
    mockDb.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0n, tipAmount: 0n } })
      .mockResolvedValueOnce({ _sum: { amount: 0n, tipAmount: 0n } });
    mockDb.payment.groupBy
      .mockResolvedValueOnce([{ orderId: "o1" }, { orderId: "o2" }])
      .mockResolvedValueOnce([{ orderId: "o-prev" }]);

    const stats = await getDashboardStats(VENDOR_ID);

    expect(typeof stats.orderCountDelta).toBe("number");
    expect(stats.orderCountDelta).toBeCloseTo(100);
  });

  it("chart payments (findMany) are scoped to a shorter window than stats window", async () => {
    mockDb.payment.aggregate.mockResolvedValue({
      _sum: { amount: 0n, tipAmount: 0n },
    });
    mockDb.payment.groupBy.mockResolvedValue([]);

    await getDashboardStats(VENDOR_ID);
    const after = Date.now();

    const findManyCalls = mockDb.payment.findMany.mock.calls;
    expect(findManyCalls.length).toBeGreaterThan(0);

    const [chartArgs] = findManyCalls[0];
    const chartFrom = chartArgs.where?.createdAt?.gte as Date;

    expect(chartFrom).toBeInstanceOf(Date);
    const windowMs = after - chartFrom.getTime();
    const fourteenDaysMs = 14 * 86_400_000;
    const thirtyDaysMs = 30 * 86_400_000;
    expect(windowMs).toBeGreaterThanOrEqual(fourteenDaysMs - 1000);
    expect(windowMs).toBeLessThan(thirtyDaysMs);
  });
});
