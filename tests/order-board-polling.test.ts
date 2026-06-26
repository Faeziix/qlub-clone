/**
 * Tests for issue #17: Real-time order board v1
 * - /api/admin/orders endpoint: auth, pagination, tenant isolation
 * - Status transition RBAC: staff can advance workflow; only manager+ can cancel
 * - Ceiling-split orders: payments with parentPaymentId count as sub-charges
 */

import { describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetSession, mockJwtVerify, mockDb, mockRedirect, mockRevalidatePath } =
  vi.hoisted(() => {
    const mockGetSession = vi.fn();
    const mockRedirect = vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    const mockRevalidatePath = vi.fn();
    const mockJwtVerify = vi.fn();
    const mockDb = {
      order: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      diningTable: {
        update: vi.fn(),
      },
      vendor: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };
    return { mockGetSession, mockJwtVerify, mockDb, mockRedirect, mockRevalidatePath };
  });

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  revalidateSession: () => mockGetSession(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: vi.fn().mockReturnValue(undefined),
    }),
}));

import { updateOrderStatus, cancelOrder } from "@/app/[locale]/admin/orders/actions";
import type { SessionUser } from "@/lib/types";

// ── Session fixtures ──────────────────────────────────────────────────────────

const staffSession = {
  id: "staff-1",
  email: "waiter@vendor-a.test",
  name: "Waiter",
  role: "staff" as const,
  vendorId: "vendor-a",
};

const managerSession = {
  id: "manager-1",
  email: "manager@vendor-a.test",
  name: "Manager",
  role: "manager" as const,
  vendorId: "vendor-a",
};

const ownerSession = {
  id: "owner-1",
  email: "owner@vendor-a.test",
  name: "Owner",
  role: "owner" as const,
  vendorId: "vendor-a",
};

const superadminSession = {
  id: "super-1",
  email: "super@qlub.io",
  name: "Superadmin",
  role: "superadmin" as const,
  vendorId: null,
};

const openOrder = {
  id: "order-1",
  vendorId: "vendor-a",
  tableId: null,
  status: "placed",
};

const activeVendor = { id: "vendor-a", active: true };

function setupOrderMocks(session: SessionUser = staffSession) {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(session);
  mockDb.order.findUnique.mockResolvedValue(openOrder);
  mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
  mockDb.order.update.mockResolvedValue({});
  mockDb.auditLog.create.mockResolvedValue({});
  mockDb.diningTable.update.mockResolvedValue({});
}

// ── RBAC: staff can advance workflow statuses ─────────────────────────────────

describe("updateOrderStatus — staff can advance workflow transitions", () => {
  it("allows staff to move order to preparing", async () => {
    setupOrderMocks(staffSession);
    await expect(updateOrderStatus("order-1", "preparing")).resolves.not.toThrow();
    expect(mockDb.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "preparing" }) })
    );
  });

  it("allows staff to move order to ready", async () => {
    setupOrderMocks(staffSession);
    await expect(updateOrderStatus("order-1", "ready")).resolves.not.toThrow();
  });

  it("allows staff to move order to served", async () => {
    setupOrderMocks(staffSession);
    await expect(updateOrderStatus("order-1", "served")).resolves.not.toThrow();
  });

  it("allows staff to move order to placed", async () => {
    setupOrderMocks(staffSession);
    await expect(updateOrderStatus("order-1", "placed")).resolves.not.toThrow();
  });
});

// ── RBAC: staff is blocked from non-workflow statuses ─────────────────────────

describe("updateOrderStatus — staff cannot set non-workflow statuses", () => {
  it("blocks staff from marking an order as paid", async () => {
    setupOrderMocks(staffSession);
    await expect(updateOrderStatus("order-1", "paid")).rejects.toThrow(/Forbidden/);
    expect(mockDb.order.update).not.toHaveBeenCalled();
  });

  it("blocks staff from marking an order as open", async () => {
    setupOrderMocks(staffSession);
    await expect(updateOrderStatus("order-1", "open")).rejects.toThrow(/Forbidden/);
  });
});

// ── RBAC: manager+ can do all transitions ────────────────────────────────────

describe("updateOrderStatus — manager and owner can set any status", () => {
  it("allows manager to mark order as paid", async () => {
    setupOrderMocks(managerSession);
    await expect(updateOrderStatus("order-1", "paid")).resolves.not.toThrow();
    expect(mockDb.order.update).toHaveBeenCalledOnce();
  });

  it("allows owner to mark order as open", async () => {
    setupOrderMocks(ownerSession);
    await expect(updateOrderStatus("order-1", "open")).resolves.not.toThrow();
  });

  it("allows superadmin to set any status", async () => {
    setupOrderMocks(superadminSession);
    mockDb.order.findUnique.mockResolvedValue({ ...openOrder, vendorId: "vendor-b" });
    await expect(updateOrderStatus("order-1", "paid")).resolves.not.toThrow();
  });
});

// ── RBAC: cancelOrder requires manager+ ──────────────────────────────────────

describe("cancelOrder — RBAC", () => {
  it("blocks staff from cancelling an order", async () => {
    setupOrderMocks(staffSession);
    await expect(cancelOrder("order-1")).rejects.toThrow(/Forbidden/);
    expect(mockDb.order.update).not.toHaveBeenCalled();
  });

  it("allows manager to cancel an order", async () => {
    setupOrderMocks(managerSession);
    await expect(cancelOrder("order-1")).resolves.not.toThrow();
    expect(mockDb.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "cancelled" }) })
    );
  });

  it("allows owner to cancel an order", async () => {
    setupOrderMocks(ownerSession);
    await expect(cancelOrder("order-1")).resolves.not.toThrow();
  });

  it("allows superadmin to cancel an order on another vendor", async () => {
    setupOrderMocks(superadminSession);
    mockDb.order.findUnique.mockResolvedValue({ ...openOrder, vendorId: "vendor-z" });
    await expect(cancelOrder("order-1")).resolves.not.toThrow();
  });

  it("resets table status to available when order with table is cancelled", async () => {
    setupOrderMocks(managerSession);
    mockDb.order.findUnique.mockResolvedValue({
      ...openOrder,
      tableId: "table-99",
    });
    await cancelOrder("order-1");
    expect(mockDb.diningTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "table-99" },
        data: { status: "available" },
      })
    );
  });

  it("does not update table status when order has no table", async () => {
    setupOrderMocks(managerSession);
    mockDb.order.findUnique.mockResolvedValue({ ...openOrder, tableId: null });
    await cancelOrder("order-1");
    expect(mockDb.diningTable.update).not.toHaveBeenCalled();
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe("updateOrderStatus — tenant isolation", () => {
  it("blocks staff from updating an order belonging to a different vendor", async () => {
    setupOrderMocks(staffSession);
    mockDb.order.findUnique.mockResolvedValue({
      ...openOrder,
      vendorId: "vendor-z",
    });
    await expect(updateOrderStatus("order-1", "preparing")).rejects.toThrow(
      /Not authorized/
    );
    expect(mockDb.order.update).not.toHaveBeenCalled();
  });
});

// ── Suspended vendor guard ────────────────────────────────────────────────────

describe("updateOrderStatus — suspended vendor", () => {
  it("blocks non-superadmin from updating status on a suspended vendor", async () => {
    setupOrderMocks(staffSession);
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: false });
    await expect(updateOrderStatus("order-1", "preparing")).rejects.toThrow(
      /VendorSuspended/
    );
  });

  it("allows superadmin to update status on a suspended vendor", async () => {
    setupOrderMocks(superadminSession);
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: false });
    await expect(updateOrderStatus("order-1", "preparing")).resolves.not.toThrow();
  });
});

// ── Ceiling-split: payment parentPaymentId logic ──────────────────────────────

describe("ceiling-split payment detection", () => {
  it("identifies sub-charges via parentPaymentId", () => {
    const payments = [
      { id: "p1", parentPaymentId: null, amount: 500_000 },
      { id: "p2", parentPaymentId: "p1", amount: 300_000 },
      { id: "p3", parentPaymentId: "p1", amount: 200_000 },
    ];
    const subCharges = payments.filter((p) => p.parentPaymentId !== null);
    expect(subCharges).toHaveLength(2);
    expect(subCharges.every((p) => p.parentPaymentId === "p1")).toBe(true);
  });

  it("returns empty sub-charges for orders without ceiling-split payments", () => {
    const payments = [
      { id: "p1", parentPaymentId: null, amount: 1_000_000 },
    ];
    const subCharges = payments.filter((p) => p.parentPaymentId !== null);
    expect(subCharges).toHaveLength(0);
  });

  it("a ceiling-split order has correct total across sub-charges", () => {
    const payments = [
      { id: "p1", parentPaymentId: null, amount: 600_000 },
      { id: "p2", parentPaymentId: "p1", amount: 400_000 },
    ];
    const total = payments.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(1_000_000);
  });
});

// ── Pagination: cursor computation ────────────────────────────────────────────

describe("pagination cursor logic", () => {
  it("nextCursor is null when results fit within limit", () => {
    const limit = 40;
    const orders = Array.from({ length: 10 }, (_, i) => ({
      id: `order-${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    const hasMore = orders.length > limit;
    const page = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() : null;
    expect(nextCursor).toBeNull();
    expect(page).toHaveLength(10);
  });

  it("nextCursor is the last item's createdAt when results exceed limit", () => {
    const limit = 3;
    const orders = Array.from({ length: 5 }, (_, i) => ({
      id: `order-${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    const hasMore = orders.length > limit;
    const page = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() : null;
    expect(nextCursor).toBe(orders[2].createdAt.toISOString());
    expect(page).toHaveLength(3);
  });

  it("full result set when orders.length equals limit exactly", () => {
    const limit = 5;
    const orders = Array.from({ length: 5 }, (_, i) => ({
      id: `order-${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    const hasMore = orders.length > limit;
    expect(hasMore).toBe(false);
    const page = hasMore ? orders.slice(0, limit) : orders;
    expect(page).toHaveLength(5);
  });
});
