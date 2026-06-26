/**
 * Tests for issue #15 — rate limiting, login lockout, sanitization, CSRF/origin checks.
 *
 * All tests run without Redis; the in-memory adapter is used throughout.
 * Behavior under the Redis adapter is identical by interface contract.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryRateLimiter,
  buildRateLimiter,
  type RateLimiter,
} from "@/lib/rate-limiter";
import { sanitizeFreeText } from "@/lib/sanitize";
import { checkOrigin } from "@/lib/csrf";

// ── InMemoryRateLimiter ───────────────────────────────────────────────────────

describe("InMemoryRateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter({ windowMs: 1000, maxRequests: 3 });
  });

  it("allows requests within the limit", async () => {
    const r1 = await limiter.check("key-a");
    const r2 = await limiter.check("key-a");
    const r3 = await limiter.check("key-a");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("blocks the request that exceeds maxRequests", async () => {
    await limiter.check("key-b");
    await limiter.check("key-b");
    await limiter.check("key-b");
    const over = await limiter.check("key-b");
    expect(over.allowed).toBe(false);
    expect(over.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", async () => {
    await limiter.check("key-c");
    await limiter.check("key-c");
    await limiter.check("key-c");
    const blocked = await limiter.check("key-c");
    const allowed = await limiter.check("key-d");
    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("resets the window after windowMs elapses", async () => {
    const shortLimiter = new InMemoryRateLimiter({
      windowMs: 50,
      maxRequests: 1,
    });
    await shortLimiter.check("key-e");
    const blocked = await shortLimiter.check("key-e");
    expect(blocked.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 60));

    const allowed = await shortLimiter.check("key-e");
    expect(allowed.allowed).toBe(true);
  });

  it("reset() clears an existing key", async () => {
    await limiter.check("key-f");
    await limiter.check("key-f");
    await limiter.check("key-f");
    await limiter.reset("key-f");
    const r = await limiter.check("key-f");
    expect(r.allowed).toBe(true);
  });
});

// ── Login lockout via rate limiter ────────────────────────────────────────────

describe("login lockout (RateLimiter applied to login key)", () => {
  it("locks out after maxAttempts consecutive failures on the same key", async () => {
    const loginLimiter = new InMemoryRateLimiter({
      windowMs: 5 * 60 * 1000,
      maxRequests: 5,
    });
    const key = "login:user@example.com";

    for (let i = 0; i < 5; i++) {
      const r = await loginLimiter.check(key);
      expect(r.allowed).toBe(true);
    }
    const locked = await loginLimiter.check(key);
    expect(locked.allowed).toBe(false);
    expect(locked.retryAfterMs).toBeGreaterThan(0);
  });
});

// ── buildRateLimiter factory ──────────────────────────────────────────────────

describe("buildRateLimiter", () => {
  it("returns an InMemoryRateLimiter when REDIS_URL is not set", async () => {
    const limiter = await buildRateLimiter({ windowMs: 1000, maxRequests: 10 });
    expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
    const r = await limiter.check("test-key");
    expect(r.allowed).toBe(true);
  });
});

// ── sanitizeFreeText ─────────────────────────────────────────────────────────

describe("sanitizeFreeText", () => {
  it("strips <script> tags", () => {
    expect(sanitizeFreeText('<script>alert("xss")</script>Great food!')).toBe(
      "Great food!"
    );
  });

  it("strips inline onerror attributes", () => {
    const input = '<img src="x" onerror="alert(1)">nice';
    const out = sanitizeFreeText(input);
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
  });

  it("strips javascript: href", () => {
    const input = '<a href="javascript:void(0)">click</a>';
    expect(sanitizeFreeText(input)).not.toContain("javascript:");
  });

  it("preserves plain text content", () => {
    expect(sanitizeFreeText("Best burger I ever had.")).toBe(
      "Best burger I ever had."
    );
  });

  it("preserves Farsi text", () => {
    expect(sanitizeFreeText("غذا عالی بود")).toBe("غذا عالی بود");
  });

  it("trims and limits length to 2000 characters", () => {
    const long = "a".repeat(2500);
    const out = sanitizeFreeText(long);
    expect(out.length).toBeLessThanOrEqual(2000);
  });

  it("returns empty string for null/undefined input", () => {
    expect(sanitizeFreeText(null as unknown as string)).toBe("");
    expect(sanitizeFreeText(undefined as unknown as string)).toBe("");
  });
});

// ── checkOrigin ───────────────────────────────────────────────────────────────

describe("checkOrigin", () => {
  const makeRequest = (origin: string | null, host = "qlub.ir") =>
    new Request("https://qlub.ir/api/orders", {
      method: "POST",
      headers: {
        ...(origin !== null ? { origin } : {}),
        host,
      },
    });

  it("allows requests where Origin matches host", () => {
    expect(checkOrigin(makeRequest("https://qlub.ir"))).toBe(true);
  });

  it("allows requests from localhost in dev-like contexts", () => {
    const req = new Request("http://localhost:3000/api/orders", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    expect(checkOrigin(req)).toBe(true);
  });

  it("rejects requests with a cross-origin Origin header", () => {
    expect(checkOrigin(makeRequest("https://evil.com"))).toBe(false);
  });

  it("allows requests with no Origin header (non-browser, server-to-server)", () => {
    expect(checkOrigin(makeRequest(null))).toBe(true);
  });

  it("rejects requests where Origin is empty string", () => {
    expect(checkOrigin(makeRequest(""))).toBe(false);
  });
});
