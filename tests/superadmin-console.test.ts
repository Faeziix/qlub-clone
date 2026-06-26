/**
 * Tests for the superadmin tenant & owner management console (issue #27).
 *
 * Covers:
 * 1. authz boundary — only superadmin may call these actions
 * 2. tenant creation → owner provisioning
 * 3. suspended-tenant refusal on customer route (getVendorBySlugActive)
 * 4. suspend / reactivate a tenant
 * 5. platform-wide staff management (role change, deactivate, reactivate)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockGetSession, mockDb, mockRedirect, mockHashPassword } =
  vi.hoisted(() => {
    const mockGetSession = vi.fn();
    const mockRedirect = vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    const mockHashPassword = vi.fn().mockResolvedValue("hashed-pw");

    const mockDb = {
      vendor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      staffUser: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    return { mockGetSession, mockDb, mockRedirect, mockHashPassword };
  });

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  revalidateSession: () => mockGetSession(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/admin-rate-limit", () => ({
  checkAdminActionLimit: vi.fn(),
}));

// ── Import units under test ───────────────────────────────────────────────────

import {
  createTenant,
  suspendTenant,
  reactivateTenant,
  provisionOwner,
  listTenants,
  listPlatformStaff,
  changeStaffRole,
  deactivateStaff,
  reactivateStaff,
} from "@/app/[locale]/admin/superadmin/actions";
import { getVendorBySlugActive } from "@/lib/queries-active";

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

const activeVendor = {
  id: "vendor-a",
  slug: "test-restaurant",
  name: "Test Restaurant",
  active: true,
  currency: "IRR",
  locale: "fa",
  timezone: "Asia/Tehran",
};

const suspendedVendor = { ...activeVendor, active: false };

// ── authz boundary tests ──────────────────────────────────────────────────────

describe("createTenant — authz", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to login when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(
      createTenant({ slug: "new-rest", name: "New Restaurant" })
    ).rejects.toThrow("REDIRECT:/admin/login");
    expect(mockDb.vendor.create).not.toHaveBeenCalled();
  });

  it("throws Forbidden for owner role", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(
      createTenant({ slug: "new-rest", name: "New Restaurant" })
    ).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.vendor.create).not.toHaveBeenCalled();
  });

  it("throws Forbidden for manager role", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await expect(
      createTenant({ slug: "new-rest", name: "New Restaurant" })
    ).rejects.toThrow(/[Ff]orbidden/);
  });

  it("throws Forbidden for staff role", async () => {
    mockGetSession.mockResolvedValue(staffSession);
    await expect(
      createTenant({ slug: "new-rest", name: "New Restaurant" })
    ).rejects.toThrow(/[Ff]orbidden/);
  });
});

describe("suspendTenant — authz", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws Forbidden for owner role", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(suspendTenant("vendor-a")).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.vendor.update).not.toHaveBeenCalled();
  });

  it("throws Forbidden for staff role", async () => {
    mockGetSession.mockResolvedValue(staffSession);
    await expect(suspendTenant("vendor-a")).rejects.toThrow(/[Ff]orbidden/);
  });
});

describe("reactivateTenant — authz", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws Forbidden for manager role", async () => {
    mockGetSession.mockResolvedValue(managerSession);
    await expect(reactivateTenant("vendor-a")).rejects.toThrow(/[Ff]orbidden/);
  });
});

describe("provisionOwner — authz", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws Forbidden for owner trying to provision another owner", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(
      provisionOwner({
        vendorId: "vendor-b",
        email: "new@owner.test",
        name: "New Owner",
        password: "Secret123!",
      })
    ).rejects.toThrow(/[Ff]orbidden/);
  });
});

describe("changeStaffRole — authz", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws Forbidden for owner role", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(
      changeStaffRole("some-staff-id", "manager")
    ).rejects.toThrow(/[Ff]orbidden/);
  });
});

// ── happy-path: tenant creation → owner login ─────────────────────────────────

describe("createTenant — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.vendor.create.mockResolvedValue({
      id: "vendor-new",
      slug: "new-restaurant",
      name: "New Restaurant",
      active: true,
    });
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("creates the vendor and records an audit event", async () => {
    const result = await createTenant({
      slug: "new-restaurant",
      name: "New Restaurant",
    });

    expect(result.ok).toBe(true);
    expect(mockDb.vendor.create).toHaveBeenCalledOnce();
    const createCall = mockDb.vendor.create.mock.calls[0][0];
    expect(createCall.data.slug).toBe("new-restaurant");
    expect(createCall.data.name).toBe("New Restaurant");
    expect(createCall.data.currency).toBe("IRR");
    expect(createCall.data.locale).toBe("fa");
    expect(createCall.data.timezone).toBe("Asia/Tehran");

    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditCall = mockDb.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("CREATE_TENANT");
    expect(auditCall.data.entity).toBe("Vendor");
  });
});

describe("provisionOwner — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.staffUser.findUnique.mockResolvedValue(null);
    mockDb.staffUser.create.mockResolvedValue({
      id: "staff-new-owner",
      email: "owner@new-rest.test",
      name: "New Owner",
      role: "owner",
      vendorId: "vendor-new",
    });
    mockDb.vendor.findUnique.mockResolvedValue({
      id: "vendor-new",
      name: "New Restaurant",
      active: true,
    });
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-2" });
  });

  it("creates the owner StaffUser bound to the vendor", async () => {
    const result = await provisionOwner({
      vendorId: "vendor-new",
      email: "owner@new-rest.test",
      name: "New Owner",
      password: "Secret123!",
    });

    expect(result.ok).toBe(true);
    expect(mockDb.staffUser.create).toHaveBeenCalledOnce();
    const createCall = mockDb.staffUser.create.mock.calls[0][0];
    expect(createCall.data.role).toBe("owner");
    expect(createCall.data.vendorId).toBe("vendor-new");
    expect(createCall.data.email).toBe("owner@new-rest.test");
    expect(createCall.data.passwordHash).toBe("hashed-pw");
  });

  it("rejects duplicate email", async () => {
    mockDb.staffUser.findUnique.mockResolvedValue({
      id: "existing",
      email: "owner@new-rest.test",
    });
    const result = await provisionOwner({
      vendorId: "vendor-new",
      email: "owner@new-rest.test",
      name: "Duplicate",
      password: "Secret123!",
    });
    expect(result.ok).toBe(false);
    expect(result.messageKey).toBe("emailTaken");
    expect(mockDb.staffUser.create).not.toHaveBeenCalled();
  });
});

// ── suspend / reactivate ──────────────────────────────────────────────────────

describe("suspendTenant — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.vendor.update.mockResolvedValue({ ...activeVendor, active: false });
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-3" });
  });

  it("sets active=false and records audit", async () => {
    const result = await suspendTenant("vendor-a");
    expect(result.ok).toBe(true);
    const updateCall = mockDb.vendor.update.mock.calls[0][0];
    expect(updateCall.data.active).toBe(false);
    const auditCall = mockDb.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("SUSPEND_TENANT");
  });
});

describe("reactivateTenant — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.vendor.findUnique.mockResolvedValue(suspendedVendor);
    mockDb.vendor.update.mockResolvedValue(activeVendor);
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-4" });
  });

  it("sets active=true and records audit", async () => {
    const result = await reactivateTenant("vendor-a");
    expect(result.ok).toBe(true);
    const updateCall = mockDb.vendor.update.mock.calls[0][0];
    expect(updateCall.data.active).toBe(true);
    const auditCall = mockDb.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("REACTIVATE_TENANT");
  });
});

// ── suspended-tenant refusal ──────────────────────────────────────────────────

describe("getVendorBySlugActive — suspended tenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the vendor is suspended (active=false)", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(suspendedVendor);
    const result = await getVendorBySlugActive("test-restaurant");
    expect(result).toBeNull();
  });

  it("returns the vendor when active=true", async () => {
    mockDb.vendor.findUnique.mockResolvedValue({
      ...activeVendor,
      menus: [],
      tables: [],
    });
    const result = await getVendorBySlugActive("test-restaurant");
    expect(result).not.toBeNull();
  });
});

// ── platform-wide staff management ───────────────────────────────────────────

describe("listTenants", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws Forbidden for non-superadmin", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(listTenants({})).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.vendor.findMany).not.toHaveBeenCalled();
  });

  it("returns all tenants for superadmin", async () => {
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.vendor.findMany.mockResolvedValue([activeVendor]);
    const result = await listTenants({});
    expect(result).toHaveLength(1);
    expect(mockDb.vendor.findMany).toHaveBeenCalledOnce();
  });
});

describe("listPlatformStaff", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws Forbidden for owner", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(listPlatformStaff({})).rejects.toThrow(/[Ff]orbidden/);
  });

  it("returns staff list for superadmin", async () => {
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.staffUser.findMany.mockResolvedValue([
      { id: "s1", email: "a@b.com", role: "owner", vendorId: "v1", active: true },
    ]);
    const result = await listPlatformStaff({});
    expect(result).toHaveLength(1);
  });
});

describe("changeStaffRole — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.staffUser.findUnique.mockResolvedValue({
      id: "staff-1",
      email: "user@test.com",
      role: "staff",
      vendorId: "vendor-a",
    });
    mockDb.staffUser.update.mockResolvedValue({ id: "staff-1", role: "manager" });
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-5" });
  });

  it("updates the role and records audit", async () => {
    const result = await changeStaffRole("staff-1", "manager");
    expect(result.ok).toBe(true);
    const updateCall = mockDb.staffUser.update.mock.calls[0][0];
    expect(updateCall.data.role).toBe("manager");
    const auditCall = mockDb.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("CHANGE_STAFF_ROLE");
  });

  it("cannot promote to superadmin", async () => {
    const result = await changeStaffRole("staff-1", "superadmin");
    expect(result.ok).toBe(false);
    expect(result.messageKey).toBe("cannotPromoteToSuperadmin");
    expect(mockDb.staffUser.update).not.toHaveBeenCalled();
  });
});

describe("deactivateStaff / reactivateStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(superadminSession);
    mockDb.staffUser.findUnique.mockResolvedValue({
      id: "staff-1",
      email: "u@t.com",
      role: "staff",
      vendorId: "vendor-a",
      active: true,
    });
    mockDb.staffUser.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-6" });
  });

  it("deactivateStaff sets active=false", async () => {
    const result = await deactivateStaff("staff-1");
    expect(result.ok).toBe(true);
    const call = mockDb.staffUser.update.mock.calls[0][0];
    expect(call.data.active).toBe(false);
  });

  it("reactivateStaff sets active=true", async () => {
    mockDb.staffUser.findUnique.mockResolvedValue({ ...mockDb.staffUser.findUnique.mock.results[0]?.value, active: false });
    const result = await reactivateStaff("staff-1");
    expect(result.ok).toBe(true);
    const call = mockDb.staffUser.update.mock.calls[0][0];
    expect(call.data.active).toBe(true);
  });

  it("throws Forbidden for non-superadmin deactivation", async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    await expect(deactivateStaff("staff-1")).rejects.toThrow(/[Ff]orbidden/);
  });
});
