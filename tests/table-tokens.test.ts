import { describe, expect, it } from "vitest";
import { cryptoPasscode } from "@/lib/table-passcode";

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
