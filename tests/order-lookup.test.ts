/**
 * Tests for the /api/orders/lookup route (issue #37 round-2 blockers).
 *
 * Covers:
 * - Rate limiting (429 when publicApi limit exceeded, keyed by IP)
 * - Origin reject (403 when checkOrigin fails)
 * - Missing params (400)
 * - Vendor not found / suspended (404)
 * - Order not found (404)
 * - Tenant isolation: order scoped by vendor id from slug lookup
 * - Happy path: returns id + status (200)
 * - normalizeDigits applied server-side (defense-in-depth for Persian/Arabic-Indic digits)
 * - Order number uppercased before lookup
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDb, mockCheckOrigin, mockLimiterCheck } = vi.hoisted(() => {
  return {
    mockDb: {
      vendor: { findUnique: vi.fn() },
      order: { findUnique: vi.fn() },
    },
    mockCheckOrigin: vi.fn(),
    mockLimiterCheck: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/csrf", () => ({ checkOrigin: mockCheckOrigin }));
vi.mock("@/lib/limiters", () => ({
  getLimiter: vi.fn(async () => ({
    check: mockLimiterCheck,
    reset: vi.fn(),
  })),
}));

import { GET } from "@/app/api/orders/lookup/route";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  params: Record<string, string>,
  ip = "1.2.3.4"
): NextRequest {
  const url = new URL("http://localhost/api/orders/lookup");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), {
    headers: { "x-forwarded-for": ip },
  });
}

const activeVendor = { id: "vendor-a", active: true };
const suspendedVendor = { id: "vendor-s", active: false };
const foundOrder = { id: "order-cuid-1", status: "placed" };
const allowedLimit = { allowed: true, retryAfterMs: 0 };
const blockedLimit = { allowed: false, retryAfterMs: 45_000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckOrigin.mockReturnValue(true);
  mockLimiterCheck.mockResolvedValue(allowedLimit);
  mockDb.vendor.findUnique.mockResolvedValue(null);
  mockDb.order.findUnique.mockResolvedValue(null);
});

// ── Origin guard ─────────────────────────────────────────────────────────────

describe("GET /api/orders/lookup — origin guard", () => {
  it("returns 403 when checkOrigin rejects", async () => {
    mockCheckOrigin.mockReturnValue(false);
    const res = await GET(makeRequest({ vendor: "slug", order: "Q-000001" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "forbidden" });
  });

  it("does not consult the rate limiter when origin check fails", async () => {
    mockCheckOrigin.mockReturnValue(false);
    await GET(makeRequest({ vendor: "slug", order: "Q-000001" }));
    expect(mockLimiterCheck).not.toHaveBeenCalled();
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe("GET /api/orders/lookup — rate limiting", () => {
  it("returns 429 with Retry-After when publicApi limit is exceeded", async () => {
    mockLimiterCheck.mockResolvedValue(blockedLimit);
    const res = await GET(makeRequest({ vendor: "slug", order: "Q-000001" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Too many requests" });
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBe("45");
  });

  it("keys the rate limiter by client IP from x-forwarded-for", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.order.findUnique.mockResolvedValue(foundOrder);
    await GET(makeRequest({ vendor: "slug", order: "Q-000001" }, "9.8.7.6"));
    expect(mockLimiterCheck).toHaveBeenCalledWith("order-lookup:9.8.7.6");
  });

  it("falls back to 'unknown' when x-forwarded-for header is absent", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.order.findUnique.mockResolvedValue(foundOrder);
    const url = new URL("http://localhost/api/orders/lookup");
    url.searchParams.set("vendor", "slug");
    url.searchParams.set("order", "Q-000001");
    const req = new NextRequest(url.toString());
    await GET(req);
    expect(mockLimiterCheck).toHaveBeenCalledWith("order-lookup:unknown");
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("GET /api/orders/lookup — input validation", () => {
  it("returns 400 when vendor param is missing", async () => {
    const res = await GET(makeRequest({ order: "Q-000001" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "missing_params" });
  });

  it("returns 400 when order param is missing", async () => {
    const res = await GET(makeRequest({ vendor: "slug" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "missing_params" });
  });

  it("returns 400 when order param is whitespace only", async () => {
    const res = await GET(makeRequest({ vendor: "slug", order: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "invalid_order_number" });
  });
});

// ── Vendor guard ──────────────────────────────────────────────────────────────

describe("GET /api/orders/lookup — vendor guard", () => {
  it("returns 404 when vendor slug does not exist", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest({ vendor: "ghost", order: "Q-000001" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when vendor is suspended (active=false)", async () => {
    mockDb.vendor.findUnique.mockResolvedValue(suspendedVendor);
    const res = await GET(makeRequest({ vendor: "slug-s", order: "Q-000001" }));
    expect(res.status).toBe(404);
    expect(mockDb.order.findUnique).not.toHaveBeenCalled();
  });
});

// ── Order lookup + tenant isolation ──────────────────────────────────────────

describe("GET /api/orders/lookup — order lookup", () => {
  beforeEach(() => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
  });

  it("returns 404 when order number does not belong to vendor", async () => {
    mockDb.order.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest({ vendor: "slug", order: "Q-999999" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 with id and status on success", async () => {
    mockDb.order.findUnique.mockResolvedValue(foundOrder);
    const res = await GET(makeRequest({ vendor: "slug", order: "Q-000001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: foundOrder.id, status: foundOrder.status });
  });

  it("enforces tenant isolation by scoping lookup to vendor id derived from slug", async () => {
    mockDb.order.findUnique.mockResolvedValue(null);
    await GET(makeRequest({ vendor: "slug", order: "Q-000001" }));
    expect(mockDb.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vendorId_orderNumber: { vendorId: activeVendor.id, orderNumber: "Q-000001" },
        },
      })
    );
  });
});

// ── normalizeDigits + uppercase defense-in-depth ──────────────────────────────

describe("GET /api/orders/lookup — server-side digit normalization", () => {
  beforeEach(() => {
    mockDb.vendor.findUnique.mockResolvedValue(activeVendor);
    mockDb.order.findUnique.mockResolvedValue(foundOrder);
  });

  it("normalizes Persian digits in the order number before DB lookup", async () => {
    const res = await GET(makeRequest({ vendor: "slug", order: "Q-۰۰۰۰۰۱" }));
    expect(res.status).toBe(200);
    expect(mockDb.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vendorId_orderNumber: { vendorId: activeVendor.id, orderNumber: "Q-000001" },
        },
      })
    );
  });

  it("normalizes Arabic-Indic digits before DB lookup", async () => {
    const res = await GET(makeRequest({ vendor: "slug", order: "Q-٠٠٠٠٠١" }));
    expect(res.status).toBe(200);
    expect(mockDb.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vendorId_orderNumber: { vendorId: activeVendor.id, orderNumber: "Q-000001" },
        },
      })
    );
  });

  it("uppercases the order number prefix before DB lookup", async () => {
    const res = await GET(makeRequest({ vendor: "slug", order: "q-000001" }));
    expect(res.status).toBe(200);
    expect(mockDb.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vendorId_orderNumber: { vendorId: activeVendor.id, orderNumber: "Q-000001" },
        },
      })
    );
  });
});
