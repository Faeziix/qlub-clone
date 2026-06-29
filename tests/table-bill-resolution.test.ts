/**
 * Tests for issue #53 — Repoint customer phone payment to the table's open
 * (waiter-built) order.
 *
 * Acceptance criteria verified here:
 * 1. GET /api/orders/active resolves the open order by table publicId + vendor.
 * 2. Returns 404 with { error: "no_open_bill" } when no open order exists.
 * 3. Returns 404 when the table publicId belongs to a different vendor (IDOR guard).
 * 4. Returns 400 for missing or malformed params.
 * 5. Returns 403 when CSRF origin check fails.
 * 6. Returns 429 when rate limit is exceeded.
 * 7. normalizeTablePublicId is applied server-side (look-alike char folding).
 * 8. Terminal-status orders (paid/cancelled) are excluded from resolution.
 * 9. The most-recently-created open order is returned when multiple exist.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockDb, mockCheckOrigin, mockLimiterCheck } = vi.hoisted(() => ({
  mockDb: {
    vendor: { findUnique: vi.fn() },
    diningTable: { findUnique: vi.fn() },
    order: { findFirst: vi.fn() },
  },
  mockCheckOrigin: vi.fn(),
  mockLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/csrf", () => ({ checkOrigin: mockCheckOrigin }));
vi.mock("@/lib/limiters", () => ({
  getLimiter: vi.fn(async () => ({ check: mockLimiterCheck, reset: vi.fn() })),
}));

import { GET } from "@/app/api/orders/active/route";
import { NextRequest } from "next/server";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(
  params: Record<string, string>,
  ip = "1.2.3.4"
): NextRequest {
  const url = new URL("http://localhost/api/orders/active");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), {
    headers: { "x-forwarded-for": ip },
  });
}

const VENDOR_ID = "vendor-abc";
const TABLE_ID = "table-xyz";
const TABLE_PUBLIC_ID = "ABCD1234";
const ORDER_ID = "order-open-1";

const activeVendor = { id: VENDOR_ID, active: true };
const suspendedVendor = { id: "vendor-s", active: false };
const ownedTable = { id: TABLE_ID, vendorId: VENDOR_ID };
const foreignTable = { id: "tbl-foreign", vendorId: "vendor-other" };
const openOrder = { id: ORDER_ID, status: "placed", orderNumber: "Q-000005" };
const allowedLimit = { allowed: true, retryAfterMs: 0 };
const blockedLimit = { allowed: false, retryAfterMs: 30_000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckOrigin.mockReturnValue(true);
  mockLimiterCheck.mockResolvedValue(allowedLimit);
  mockDb.vendor.findUnique.mockResolvedValue(null);
  mockDb.diningTable.findUnique.mockResolvedValue(null);
  mockDb.order.findFirst.mockResolvedValue(null);
});

// ── CSRF guard ─────────────────────────────────────────────────────────────────

describe("GET /api/orders/active — CSRF guard", () => {
  it("returns 403 when origin check fails", async () => {
    mockCheckOrigin.mockReturnValue(false);
    const res = await GET(
      makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "forbidden" });
  });

  it("does not consult the rate limiter when origin check fails", async () => {
    mockCheckOrigin.mockReturnValue(false);
    await GET(makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID }));
    expect(mockLimiterCheck).not.toHaveBeenCalled();
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────────

describe("GET /api/orders/active — rate limiting", () => {
  it("returns 429 with Retry-After when publicApi limit is exceeded", async () => {
    mockLimiterCheck.mockResolvedValue(blockedLimit);
    const res = await GET(
      makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Too many requests" });
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("keys the rate limiter by client IP", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(ownedTable);
    mockDb.order.findFirst.mockResolvedValue(openOrder);
    await GET(makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID }, "5.6.7.8"));
    expect(mockLimiterCheck).toHaveBeenCalledWith("order-active:5.6.7.8");
  });
});

// ── Input validation ───────────────────────────────────────────────────────────

describe("GET /api/orders/active — input validation", () => {
  it("returns 400 when vendor param is missing", async () => {
    const res = await GET(makeRequest({ tablePublicId: TABLE_PUBLIC_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "missing_params" });
  });

  it("returns 400 when tablePublicId param is missing", async () => {
    const res = await GET(makeRequest({ vendor: "slug" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "missing_params" });
  });

  it("returns 400 when tablePublicId is not a valid 8-char Crockford ID", async () => {
    const res = await GET(makeRequest({ vendor: "slug", tablePublicId: "bad-id" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "invalid_table_id" });
  });
});

// ── Vendor guard ───────────────────────────────────────────────────────────────

describe("GET /api/orders/active — vendor guard", () => {
  it("returns 404 when vendor slug does not exist", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(null);
    const res = await GET(
      makeRequest({ vendor: "ghost", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when vendor is suspended (active=false)", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(suspendedVendor);
    const res = await GET(
      makeRequest({ vendor: "suspended-slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(404);
    expect(mockDb.diningTable.findUnique).not.toHaveBeenCalled();
  });
});

// ── Tenant isolation (IDOR guard) ──────────────────────────────────────────────

describe("GET /api/orders/active — tenant isolation", () => {
  it("returns 404 when table publicId belongs to a different vendor", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(foreignTable);
    const res = await GET(
      makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(404);
    expect(mockDb.order.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when table publicId does not exist", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(null);
    const res = await GET(
      makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(404);
    expect(mockDb.order.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the order lookup by both vendorId and tableId from the resolved table", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(ownedTable);
    mockDb.order.findFirst.mockResolvedValue(openOrder);
    await GET(makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID }));
    expect(mockDb.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vendorId: VENDOR_ID,
          tableId: TABLE_ID,
        }),
      })
    );
  });
});

// ── Happy path ─────────────────────────────────────────────────────────────────

describe("GET /api/orders/active — happy path", () => {
  beforeEach(() => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(ownedTable);
    mockDb.order.findFirst.mockResolvedValue(openOrder);
  });

  it("returns 200 with id, status, and orderNumber when an open order exists", async () => {
    const res = await GET(
      makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: openOrder.id,
      status: openOrder.status,
      orderNumber: openOrder.orderNumber,
    });
  });

  it("looks up the table by normalized publicId (uppercased)", async () => {
    await GET(makeRequest({ vendor: "slug", tablePublicId: "abcd1234" }));
    expect(mockDb.diningTable.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: "ABCD1234" } })
    );
  });

  it("folds look-alike chars in publicId (I→1, L→1, O→0) before DB lookup", async () => {
    await GET(makeRequest({ vendor: "slug", tablePublicId: "ABCDIO34" }));
    expect(mockDb.diningTable.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: "ABCD1034" } })
    );
  });
});

// ── No open bill ───────────────────────────────────────────────────────────────

describe("GET /api/orders/active — no open bill", () => {
  beforeEach(() => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(ownedTable);
  });

  it("returns 404 with no_open_bill when no non-terminal order exists for the table", async () => {
    mockDb.order.findFirst.mockResolvedValue(null);
    const res = await GET(
      makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: "no_open_bill" });
  });

  it("excludes paid orders from the active-bill lookup", async () => {
    mockDb.order.findFirst.mockResolvedValue(null);
    await GET(makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID }));
    const whereClause = (
      mockDb.order.findFirst.mock.calls[0] as [{ where: { status: { notIn: string[] } } }]
    )[0].where;
    expect(whereClause.status.notIn).toContain("paid");
  });

  it("excludes cancelled orders from the active-bill lookup", async () => {
    mockDb.order.findFirst.mockResolvedValue(null);
    await GET(makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID }));
    const whereClause = (
      mockDb.order.findFirst.mock.calls[0] as [{ where: { status: { notIn: string[] } } }]
    )[0].where;
    expect(whereClause.status.notIn).toContain("cancelled");
  });
});

// ── Most-recent order selection ────────────────────────────────────────────────

describe("GET /api/orders/active — order selection", () => {
  it("requests the most-recently-created order (orderBy createdAt desc)", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.diningTable.findUnique.mockResolvedValue(ownedTable);
    mockDb.order.findFirst.mockResolvedValue(openOrder);
    await GET(makeRequest({ vendor: "slug", tablePublicId: TABLE_PUBLIC_ID }));
    expect(mockDb.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });
});
