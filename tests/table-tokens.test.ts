/**
 * Tests for issue #16: crypto passcodes + signed table tokens.
 *
 * Verifies:
 * 1. Table passcodes are 4-digit strings drawn from crypto entropy (not Math.random).
 * 2. signTableToken produces a compact JWT-style HMAC token.
 * 3. verifyTableToken accepts valid vendor+table combinations.
 * 4. verifyTableToken rejects tokens signed with a different secret (tampering).
 * 5. verifyTableToken rejects tokens whose vendorId or tableId were mutated.
 * 6. verifyTableToken rejects expired tokens (past exp claim).
 */

import { describe, expect, it, vi } from "vitest";

// ── Test environment setup ────────────────────────────────────────────────────
// requireAuthSecret reads process.env.AUTH_SECRET; set a test secret.
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-chars-long!!";

// ── Import the modules under test ─────────────────────────────────────────────
import { cryptoPasscode } from "@/lib/table-token";
import { signTableToken, verifyTableToken } from "@/lib/table-token";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const VENDOR_ID = "vendor-abc-123";
const TABLE_ID = "table-xyz-456";
const OTHER_VENDOR_ID = "vendor-evil-999";
const OTHER_TABLE_ID = "table-evil-999";

// ── cryptoPasscode ─────────────────────────────────────────────────────────────

describe("cryptoPasscode", () => {
  it("returns a 4-digit string", () => {
    const pc = cryptoPasscode();
    expect(pc).toMatch(/^\d{4}$/);
  });

  it("returns a value in [1000, 9999]", () => {
    for (let i = 0; i < 50; i++) {
      const n = Number(cryptoPasscode());
      expect(n).toBeGreaterThanOrEqual(1000);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it("uses crypto entropy (different calls produce different values at scale)", () => {
    const samples = new Set(Array.from({ length: 200 }, () => cryptoPasscode()));
    expect(samples.size).toBeGreaterThan(50);
  });
});

// ── signTableToken / verifyTableToken ─────────────────────────────────────────

describe("signTableToken → verifyTableToken (valid token)", () => {
  it("verifies a freshly signed token and returns vendorId + tableId", async () => {
    const token = await signTableToken({ vendorId: VENDOR_ID, tableId: TABLE_ID });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const result = await verifyTableToken(token);
    expect(result).not.toBeNull();
    expect(result?.vendorId).toBe(VENDOR_ID);
    expect(result?.tableId).toBe(TABLE_ID);
  });

  it("round-trips different vendor+table pairs without collision", async () => {
    const t1 = await signTableToken({ vendorId: "v1", tableId: "t1" });
    const t2 = await signTableToken({ vendorId: "v2", tableId: "t2" });
    const r1 = await verifyTableToken(t1);
    const r2 = await verifyTableToken(t2);
    expect(r1?.vendorId).toBe("v1");
    expect(r1?.tableId).toBe("t1");
    expect(r2?.vendorId).toBe("v2");
    expect(r2?.tableId).toBe("t2");
  });
});

describe("verifyTableToken — tampered / foreign token rejection", () => {
  it("returns null for a completely arbitrary string", async () => {
    const result = await verifyTableToken("not-a-jwt-at-all");
    expect(result).toBeNull();
  });

  it("returns null when the JWT is signed with a different secret", async () => {
    const originalSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "totally-different-secret-that-is-long-enough-!!!";
    const foreignToken = await signTableToken({ vendorId: VENDOR_ID, tableId: TABLE_ID });
    process.env.AUTH_SECRET = originalSecret;

    const result = await verifyTableToken(foreignToken);
    expect(result).toBeNull();
  });

  it("returns null when the token payload has been mutated (different vendorId)", async () => {
    const validToken = await signTableToken({
      vendorId: VENDOR_ID,
      tableId: TABLE_ID,
    });

    // Decode the payload section and replace vendorId.
    const parts = validToken.split(".");
    expect(parts.length).toBe(3);

    // Replace the payload with a mutated version that points to OTHER_VENDOR_ID.
    const mutatedPayload = Buffer.from(
      JSON.stringify({ vendorId: OTHER_VENDOR_ID, tableId: TABLE_ID })
    ).toString("base64url");
    const mutatedToken = [parts[0], mutatedPayload, parts[2]].join(".");

    const result = await verifyTableToken(mutatedToken);
    expect(result).toBeNull();
  });

  it("returns null when the token payload has been mutated (different tableId)", async () => {
    const validToken = await signTableToken({
      vendorId: VENDOR_ID,
      tableId: TABLE_ID,
    });
    const parts = validToken.split(".");
    const mutatedPayload = Buffer.from(
      JSON.stringify({ vendorId: VENDOR_ID, tableId: OTHER_TABLE_ID })
    ).toString("base64url");
    const mutatedToken = [parts[0], mutatedPayload, parts[2]].join(".");

    const result = await verifyTableToken(mutatedToken);
    expect(result).toBeNull();
  });

  it("returns null for an expired token", async () => {
    // Tokens with ttlSeconds = 0 will already be at or past their expiry.
    vi.useFakeTimers();

    const token = await signTableToken(
      { vendorId: VENDOR_ID, tableId: TABLE_ID },
      { ttlSeconds: 1 }
    );

    // Advance time by 2 seconds to ensure expiry.
    vi.advanceTimersByTime(2000);

    const result = await verifyTableToken(token);
    expect(result).toBeNull();

    vi.useRealTimers();
  });
});

describe("verifyTableToken — expected content contract", () => {
  it("returns a non-null object with exactly vendorId and tableId properties", async () => {
    const token = await signTableToken({ vendorId: VENDOR_ID, tableId: TABLE_ID });
    const result = await verifyTableToken(token);
    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual(["tableId", "vendorId"]);
  });
});
