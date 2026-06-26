/**
 * Tests for admin action rate limiting (issue #15 — round 2 blocker).
 *
 * Verifies that admin mutation server actions gate calls through the
 * `adminAction` limiter keyed by `admin:<userId>`.  The limiter module is
 * replaced with a controllable fake so tests exercise the gate logic
 * independently of any real Redis or in-memory window state.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockGetSession, mockDb, mockCheckAdminAction, mockRedirect } =
  vi.hoisted(() => {
    const mockGetSession = vi.fn();
    const mockRedirect = vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    let adminActionAllowed = true;
    const mockCheckAdminAction = {
      setAllowed: (v: boolean) => {
        adminActionAllowed = v;
      },
      fn: vi.fn(async (_key: string) => ({
        allowed: adminActionAllowed,
        retryAfterMs: adminActionAllowed ? 0 : 60_000,
      })),
    };

    const mockDb = {
      menuItem: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      menuItemTranslation: { upsert: vi.fn() },
      modifierGroup: { findMany: vi.fn(), deleteMany: vi.fn() },
      modifierOption: { deleteMany: vi.fn() },
      category: { findUnique: vi.fn() },
      order: { findUnique: vi.fn(), update: vi.fn() },
      diningTable: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      vendor: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    return { mockGetSession, mockDb, mockCheckAdminAction, mockRedirect };
  });

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/lib/limiters", () => ({
  getLimiter: vi.fn(async (name: string) => {
    if (name === "adminAction") {
      return { check: mockCheckAdminAction.fn, reset: vi.fn() };
    }
    return { check: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })), reset: vi.fn() };
  }),
}));

// ── Import units under test (after mocks) ────────────────────────────────────

import { toggleItemAvailability, updateItemPrice, updateItem, createItem, deleteItem } from "@/app/[locale]/admin/menu/actions";
import { updateOrderStatus, cancelOrder } from "@/app/[locale]/admin/orders/actions";
import { updateTableStatus, createTable, deleteTable } from "@/app/[locale]/admin/tables/actions";
import { updateVendorSettings } from "@/app/[locale]/admin/settings/actions";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const managerSession = {
  id: "staff-manager",
  email: "manager@vendor-a.test",
  name: "Manager A",
  role: "manager" as const,
  vendorId: "vendor-a",
};

const ownerSession = {
  id: "staff-owner",
  email: "owner@vendor-a.test",
  name: "Owner A",
  role: "owner" as const,
  vendorId: "vendor-a",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function allowAdminAction() {
  mockCheckAdminAction.setAllowed(true);
  mockCheckAdminAction.fn.mockClear();
}

function blockAdminAction() {
  mockCheckAdminAction.setAllowed(false);
  mockCheckAdminAction.fn.mockClear();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("menu/actions — admin action rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.menuItem.findUnique.mockResolvedValue({
      id: "item-1",
      vendorId: "vendor-a",
      available: true,
      name: "Kebab",
      price: BigInt(100_000),
    });
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: true });
    mockDb.menuItem.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    allowAdminAction();
  });

  it("calls adminAction limiter keyed by admin:<userId> on toggleItemAvailability", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await toggleItemAvailability("item-1", false);
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${managerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks toggleItemAvailability", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    blockAdminAction();
    await expect(toggleItemAvailability("item-1", false)).rejects.toThrow(
      /too many/i
    );
    expect(mockDb.menuItem.update).not.toHaveBeenCalled();
  });

  it("calls adminAction limiter keyed by admin:<userId> on updateItemPrice", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await updateItemPrice("item-1", "10000");
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${managerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks updateItemPrice", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    blockAdminAction();
    await expect(updateItemPrice("item-1", "10000")).rejects.toThrow(
      /too many/i
    );
    expect(mockDb.menuItem.update).not.toHaveBeenCalled();
  });
});

describe("orders/actions — admin action rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.order.findUnique.mockResolvedValue({
      id: "order-1",
      vendorId: "vendor-a",
      tableId: null,
      status: "placed",
    });
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: true });
    mockDb.order.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    allowAdminAction();
  });

  it("calls adminAction limiter keyed by admin:<userId> on updateOrderStatus", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await updateOrderStatus("order-1", "preparing");
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${managerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks updateOrderStatus", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    blockAdminAction();
    await expect(updateOrderStatus("order-1", "preparing")).rejects.toThrow(
      /too many/i
    );
    expect(mockDb.order.update).not.toHaveBeenCalled();
  });

  it("calls adminAction limiter keyed by admin:<userId> on cancelOrder", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await cancelOrder("order-1");
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${managerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks cancelOrder", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    blockAdminAction();
    await expect(cancelOrder("order-1")).rejects.toThrow(/too many/i);
    expect(mockDb.order.update).not.toHaveBeenCalled();
  });
});

describe("tables/actions — admin action rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.diningTable.findUnique.mockResolvedValue({
      id: "table-1",
      vendorId: "vendor-a",
    });
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: true });
    mockDb.diningTable.update.mockResolvedValue({});
    mockDb.diningTable.delete.mockResolvedValue({});
    mockDb.diningTable.create.mockResolvedValue({ id: "table-2" });
    mockDb.auditLog.create.mockResolvedValue({});
    allowAdminAction();
  });

  it("calls adminAction limiter keyed by admin:<userId> on updateTableStatus", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await updateTableStatus("table-1", "occupied");
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${managerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks updateTableStatus", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    blockAdminAction();
    await expect(updateTableStatus("table-1", "occupied")).rejects.toThrow(
      /too many/i
    );
    expect(mockDb.diningTable.update).not.toHaveBeenCalled();
  });

  it("calls adminAction limiter on deleteTable", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await deleteTable("table-1");
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${managerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks deleteTable", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    blockAdminAction();
    await expect(deleteTable("table-1")).rejects.toThrow(/too many/i);
    expect(mockDb.diningTable.delete).not.toHaveBeenCalled();
  });
});

describe("settings/actions — admin action rate limiting", () => {
  const validSettings = {
    name: "New Name",
    description: "",
    address: "",
    phone: "",
    email: "",
    theme: "darkgold",
    logoUrl: "",
    coverUrl: "",
    serviceChargePct: 0,
    taxPct: 0,
    taxInclusive: true,
    tippingEnabled: true,
    tipPresets: [5, 10, 15],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", name: "Old", active: true });
    mockDb.vendor.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    allowAdminAction();
  });

  it("calls adminAction limiter keyed by admin:<userId> on updateVendorSettings", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await updateVendorSettings("vendor-a", validSettings);
    expect(mockCheckAdminAction.fn).toHaveBeenCalledWith(`admin:${ownerSession.id}`);
  });

  it("throws TooManyRequests when adminAction limiter blocks updateVendorSettings", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    blockAdminAction();
    await expect(
      updateVendorSettings("vendor-a", validSettings)
    ).rejects.toThrow(/too many/i);
    expect(mockDb.vendor.update).not.toHaveBeenCalled();
  });
});
