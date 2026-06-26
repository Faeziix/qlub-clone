/**
 * Tests for admin auth hardening (issue #14):
 * - RBAC assertRole / requireRole helpers
 * - Audit log recording
 * - Session re-validation on sensitive actions
 * - Action-level RBAC enforcement (staff cannot reach owner capabilities)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockGetSession, mockDb, mockRedirect } = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockRedirect = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  const mockDb = {
    staffUser: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    diningTable: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    vendor: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { mockGetSession, mockDb, mockRedirect };
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

// ── Import units under test ───────────────────────────────────────────────────

import { assertRole, requireRole, ROLE_HIERARCHY } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { updateOrderStatus } from "@/app/[locale]/admin/orders/actions";
import { updateVendorSettings } from "@/app/[locale]/admin/settings/actions";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const superadminSession = {
  id: "staff-super",
  email: "super@qlub.io",
  name: "Superadmin",
  role: "superadmin" as const,
  vendorId: null,
};

const ownerSession = {
  id: "staff-owner",
  email: "owner@vendor-a.test",
  name: "Owner A",
  role: "owner" as const,
  vendorId: "vendor-a",
};

const managerSession = {
  id: "staff-manager",
  email: "manager@vendor-a.test",
  name: "Manager A",
  role: "manager" as const,
  vendorId: "vendor-a",
};

const staffSession = {
  id: "staff-waiter",
  email: "waiter@vendor-a.test",
  name: "Waiter",
  role: "staff" as const,
  vendorId: "vendor-a",
};

// ── RBAC helper tests ─────────────────────────────────────────────────────────

describe("ROLE_HIERARCHY", () => {
  it("superadmin has the highest level", () => {
    expect(ROLE_HIERARCHY.superadmin).toBeGreaterThan(ROLE_HIERARCHY.owner);
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.manager);
    expect(ROLE_HIERARCHY.manager).toBeGreaterThan(ROLE_HIERARCHY.staff);
  });
});

describe("assertRole", () => {
  it("does not throw when session role meets the minimum", () => {
    expect(() => assertRole(superadminSession, "staff")).not.toThrow();
    expect(() => assertRole(ownerSession, "owner")).not.toThrow();
    expect(() => assertRole(managerSession, "manager")).not.toThrow();
    expect(() => assertRole(staffSession, "staff")).not.toThrow();
  });

  it("throws Forbidden when session role is below the minimum", () => {
    expect(() => assertRole(staffSession, "manager")).toThrow(/[Ff]orbidden/);
    expect(() => assertRole(staffSession, "owner")).toThrow(/[Ff]orbidden/);
    expect(() => assertRole(managerSession, "owner")).toThrow(/[Ff]orbidden/);
    expect(() => assertRole(staffSession, "superadmin")).toThrow(/[Ff]orbidden/);
  });

  it("superadmin passes all role checks", () => {
    expect(() => assertRole(superadminSession, "superadmin")).not.toThrow();
    expect(() => assertRole(superadminSession, "owner")).not.toThrow();
    expect(() => assertRole(superadminSession, "staff")).not.toThrow();
  });
});

describe("requireRole", () => {
  it("redirects to login when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(requireRole("staff")).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("returns the session when role meets minimum", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const result = await requireRole("manager");
    expect(result).toEqual(ownerSession);
  });

  it("throws Forbidden when session role is insufficient", async () => {
    mockGetSession.mockResolvedValue(staffSession);
    await expect(requireRole("owner")).rejects.toThrow(/[Ff]orbidden/);
  });
});

// ── Audit log tests ───────────────────────────────────────────────────────────

describe("recordAuditEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls db.auditLog.create with correct fields", async () => {
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-1" });

    await recordAuditEvent({
      actorId: "staff-owner",
      vendorId: "vendor-a",
      action: "UPDATE_VENDOR_SETTINGS",
      entity: "Vendor",
      entityId: "vendor-a",
      before: { name: "Old Name" },
      after: { name: "New Name" },
    });

    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const call = mockDb.auditLog.create.mock.calls[0][0];
    expect(call.data.actorId).toBe("staff-owner");
    expect(call.data.action).toBe("UPDATE_VENDOR_SETTINGS");
    expect(call.data.entity).toBe("Vendor");
    expect(call.data.entityId).toBe("vendor-a");
  });

  it("works without optional before/after snapshots", async () => {
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-2" });

    await expect(
      recordAuditEvent({
        actorId: "staff-owner",
        vendorId: "vendor-a",
        action: "LOGIN",
        entity: "StaffUser",
        entityId: "staff-owner",
      })
    ).resolves.not.toThrow();
  });
});

// ── RBAC enforcement in action layer ─────────────────────────────────────────

describe("updateOrderStatus — RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.order.findUnique.mockResolvedValue({
      id: "order-1",
      vendorId: "vendor-a",
      tableId: null,
    });
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: true });
    mockDb.order.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
  });

  it("allows staff to update order status (their permitted action)", async () => {
    mockGetSession.mockResolvedValue(staffSession);
    await expect(
      updateOrderStatus("order-1", "preparing")
    ).resolves.not.toThrow();
    expect(mockDb.order.update).toHaveBeenCalledOnce();
  });

  it("allows owner to update order status", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(
      updateOrderStatus("order-1", "served")
    ).resolves.not.toThrow();
  });

  it("rejects unauthenticated call with redirect to login", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(updateOrderStatus("order-1", "preparing")).rejects.toThrow(
      "REDIRECT:/admin/login"
    );
  });

  it("refuses owner of a suspended vendor from updating order status", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: false });
    await expect(updateOrderStatus("order-1", "preparing")).rejects.toThrow(
      /VendorSuspended/
    );
    expect(mockDb.order.update).not.toHaveBeenCalled();
  });

  it("allows superadmin to manage orders on a suspended vendor", async () => {
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", active: false });
    await expect(
      updateOrderStatus("order-1", "cancelled")
    ).resolves.not.toThrow();
    expect(mockDb.order.update).toHaveBeenCalledOnce();
  });
});

describe("updateVendorSettings — RBAC: staff cannot reach owner capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", name: "Old", active: true });
    mockDb.vendor.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
  });

  it("allows owner to update vendor settings", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const result = await updateVendorSettings("vendor-a", {
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
    });
    expect(result.ok).toBe(true);
  });

  it("blocks staff from updating vendor settings", async () => {
    mockGetSession.mockResolvedValue(staffSession);
    await expect(
      updateVendorSettings("vendor-a", {
        name: "Injected",
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
      })
    ).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.vendor.update).not.toHaveBeenCalled();
  });

  it("blocks manager from updating vendor settings", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await expect(
      updateVendorSettings("vendor-a", {
        name: "Injected",
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
      })
    ).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.vendor.update).not.toHaveBeenCalled();
  });

  it("superadmin can update settings for any vendor", async () => {
    mockGetSession.mockResolvedValue(superadminSession);
    const result = await updateVendorSettings("vendor-a", {
      name: "Updated",
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
    });
    expect(result.ok).toBe(true);
  });

  it("refuses owner of a suspended vendor from updating settings", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockDb.vendor.findUnique.mockResolvedValue({ id: "vendor-a", name: "Old", active: false });
    await expect(
      updateVendorSettings("vendor-a", {
        name: "Malicious Update",
        description: "",
        address: "",
        phone: "",
        email: "",
        theme: "darkgold",
        logoUrl: "",
        coverUrl: "",
        serviceChargePct: 50,
        taxPct: 50,
        taxInclusive: false,
        tippingEnabled: false,
        tipPresets: [0, 0, 0],
      })
    ).rejects.toThrow(/VendorSuspended/);
    expect(mockDb.vendor.update).not.toHaveBeenCalled();
  });
});
