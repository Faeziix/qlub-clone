/**
 * Integration tests for the tables actions IDOR fix (issue #3).
 *
 * Verifies:
 * 1. All three table mutations require a valid admin session.
 * 2. A table mutation targeting another vendor's table is rejected.
 *
 * Dependencies are mocked so no database or Next.js runtime is needed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
// vi.mock factory functions are hoisted to the top of the file, so any
// variables they reference must also be hoisted via vi.hoisted.

const { mockGetSession, mockDb } = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockDb = {
    diningTable: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    vendor: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  return { mockGetSession, mockDb };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// requireSession calls redirect() when there is no session; stub it so we can
// detect the redirect without the Next.js router.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

// ── Import the unit under test (after mocks are registered) ─────────────────

import {
  createTable,
  updateTableStatus,
  deleteTable,
} from "@/app/[locale]/admin/tables/actions";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VENDOR_A_ID = "vendor-aaa";
const VENDOR_B_ID = "vendor-bbb";
const TABLE_A_ID = "table-aaa";

const sessionVendorA = {
  id: "staff-a",
  email: "owner@vendor-a.test",
  name: "Owner A",
  role: "owner" as const,
  vendorId: VENDOR_A_ID,
};

const tableOwnedByVendorA = {
  id: TABLE_A_ID,
  vendorId: VENDOR_A_ID,
  code: "T1",
  label: "Table 1",
  status: "available",
};

// ── Test suites ───────────────────────────────────────────────────────────────

describe("tables actions — unauthenticated rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  it("createTable rejects unauthenticated calls with a redirect to /admin/login", async () => {
    await expect(
      createTable(VENDOR_A_ID, { code: "T1", label: "Table 1", seats: 4, area: "Main" })
    ).rejects.toThrow("REDIRECT:/admin/login");
    expect(mockDb.diningTable.create).not.toHaveBeenCalled();
  });

  it("updateTableStatus rejects unauthenticated calls with a redirect to /admin/login", async () => {
    await expect(updateTableStatus(TABLE_A_ID, "occupied")).rejects.toThrow(
      "REDIRECT:/admin/login"
    );
    expect(mockDb.diningTable.update).not.toHaveBeenCalled();
  });

  it("deleteTable rejects unauthenticated calls with a redirect to /admin/login", async () => {
    await expect(deleteTable(TABLE_A_ID)).rejects.toThrow(
      "REDIRECT:/admin/login"
    );
    expect(mockDb.diningTable.delete).not.toHaveBeenCalled();
  });
});

describe("tables actions — cross-tenant write denied", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Session belongs to vendor B; the target tables belong to vendor A.
    mockGetSession.mockResolvedValue({ ...sessionVendorA, vendorId: VENDOR_B_ID });
    mockDb.diningTable.findUnique.mockResolvedValue(tableOwnedByVendorA);
  });

  it("createTable rejects when the caller tries to create a table under another vendor", async () => {
    await expect(
      createTable(VENDOR_A_ID, { code: "T99", label: "Injected", seats: 2, area: "Main" })
    ).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.diningTable.create).not.toHaveBeenCalled();
  });

  it("updateTableStatus rejects a status change on another vendor's table", async () => {
    await expect(updateTableStatus(TABLE_A_ID, "occupied")).rejects.toThrow(
      /[Ff]orbidden/
    );
    expect(mockDb.diningTable.update).not.toHaveBeenCalled();
  });

  it("deleteTable rejects deletion of another vendor's table", async () => {
    await expect(deleteTable(TABLE_A_ID)).rejects.toThrow(/[Ff]orbidden/);
    expect(mockDb.diningTable.delete).not.toHaveBeenCalled();
  });
});

describe("tables actions — authorised happy-path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(sessionVendorA);
    mockDb.diningTable.findUnique.mockResolvedValue(tableOwnedByVendorA);
    mockDb.diningTable.create.mockResolvedValue({ id: "new-table" });
    mockDb.diningTable.update.mockResolvedValue(tableOwnedByVendorA);
    mockDb.diningTable.delete.mockResolvedValue(tableOwnedByVendorA);
    mockDb.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("createTable succeeds when the caller owns the vendor", async () => {
    await expect(
      createTable(VENDOR_A_ID, { code: "T2", label: "Table 2", seats: 4, area: "Main" })
    ).resolves.not.toThrow();
    expect(mockDb.diningTable.create).toHaveBeenCalledOnce();
  });

  it("updateTableStatus succeeds when the caller owns the table's vendor", async () => {
    await expect(updateTableStatus(TABLE_A_ID, "occupied")).resolves.not.toThrow();
    expect(mockDb.diningTable.update).toHaveBeenCalledOnce();
  });

  it("deleteTable succeeds when the caller owns the table's vendor", async () => {
    await expect(deleteTable(TABLE_A_ID)).resolves.not.toThrow();
    expect(mockDb.diningTable.delete).toHaveBeenCalledOnce();
  });

  it("superadmin (vendorId null) may mutate any vendor's tables", async () => {
    mockGetSession.mockResolvedValue({
      ...sessionVendorA,
      role: "superadmin",
      vendorId: null,
    });
    await expect(
      createTable(VENDOR_A_ID, {
        code: "T3",
        label: "Table 3",
        seats: 2,
        area: "Terrace",
      })
    ).resolves.not.toThrow();
    expect(mockDb.diningTable.create).toHaveBeenCalledOnce();
  });
});
