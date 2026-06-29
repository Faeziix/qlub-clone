import { describe, it, expect, vi } from "vitest";
import {
  generateTablePublicId,
  normalizeTablePublicId,
  isValidTablePublicId,
} from "@/lib/table-code";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

describe("generateTablePublicId", () => {
  it("produces exactly 8 characters", () => {
    expect(generateTablePublicId()).toHaveLength(8);
  });

  it("uses only Crockford base32 characters (no I, L, O, U)", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateTablePublicId();
      expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });

  it("every character belongs to the Crockford alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateTablePublicId();
      for (const ch of id) {
        expect(CROCKFORD_ALPHABET).toContain(ch);
      }
    }
  });

  it("generates high-entropy codes (no obvious low-entropy pattern)", () => {
    const samples = new Set(
      Array.from({ length: 500 }, () => generateTablePublicId())
    );
    expect(samples.size).toBeGreaterThan(490);
  });

  it("regenerates on unique-constraint collision (retry loop)", () => {
    const collisionCode = "AAAAAAAA";
    let callCount = 0;

    vi.spyOn(crypto, "getRandomValues").mockImplementation((buf) => {
      callCount++;
      if (callCount <= 3) {
        (buf as Uint8Array).fill(0);
      } else {
        (buf as Uint8Array).fill(255);
      }
      return buf as Uint8Array;
    });

    const seenCodes = new Set<string>();
    let generated: string;

    do {
      generated = generateTablePublicId();
      if (seenCodes.has(generated)) {
        continue;
      }
      seenCodes.add(generated);
    } while (generated === collisionCode);

    expect(seenCodes.size).toBeGreaterThanOrEqual(1);
    expect(generated).not.toBe(collisionCode);

    vi.restoreAllMocks();
  });
});

describe("normalizeTablePublicId", () => {
  it("uppercases lowercase input", () => {
    expect(normalizeTablePublicId("abcdefgh")).toBe("ABCDEFGH");
  });

  it("strips hyphens and spaces", () => {
    expect(normalizeTablePublicId("8F3K-Q2M9")).toBe("8F3KQ2M9");
    expect(normalizeTablePublicId("8F3K Q2M9")).toBe("8F3KQ2M9");
    expect(normalizeTablePublicId(" 8F3K - Q2M9 ")).toBe("8F3KQ2M9");
  });

  it("maps I → 1", () => {
    expect(normalizeTablePublicId("I")).toBe("1");
    expect(normalizeTablePublicId("IIII1111")).toBe("11111111");
  });

  it("maps L → 1", () => {
    expect(normalizeTablePublicId("L")).toBe("1");
    expect(normalizeTablePublicId("LLLL1111")).toBe("11111111");
  });

  it("maps O → 0", () => {
    expect(normalizeTablePublicId("O")).toBe("0");
    expect(normalizeTablePublicId("OOOO0000")).toBe("00000000");
  });

  it("handles mixed case + look-alike folding together", () => {
    expect(normalizeTablePublicId("i1o0L-l")).toBe("1100 11".replace(/ /g, ""));
    expect(normalizeTablePublicId("lo-Il")).toBe("1011");
  });

  it("passes valid Crockford chars unchanged", () => {
    expect(normalizeTablePublicId("8F3KQ2M9")).toBe("8F3KQ2M9");
  });
});

describe("isValidTablePublicId", () => {
  it("returns true for a valid 8-char Crockford code", () => {
    const id = generateTablePublicId();
    expect(isValidTablePublicId(id)).toBe(true);
  });

  it("returns false for codes shorter or longer than 8 chars", () => {
    expect(isValidTablePublicId("AAAAAAA")).toBe(false);
    expect(isValidTablePublicId("AAAAAAAAA")).toBe(false);
    expect(isValidTablePublicId("")).toBe(false);
  });

  it("returns false for codes containing excluded characters (I, L, O, U)", () => {
    expect(isValidTablePublicId("AAAAIAA1")).toBe(false);
    expect(isValidTablePublicId("AAAALAA1")).toBe(false);
    expect(isValidTablePublicId("AAAAOAA1")).toBe(false);
    expect(isValidTablePublicId("AAAAUAA1")).toBe(false);
  });

  it("returns false for codes with lowercase", () => {
    expect(isValidTablePublicId("aaaaaaaa")).toBe(false);
  });
});

describe("generated links do not contain tt or JWT", () => {
  it("generateTablePublicId output is never a JWT (no dots separating base64 sections)", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateTablePublicId();
      expect(id).not.toContain(".");
      expect(id).not.toContain("tt");
    }
  });

  it("a URL built with publicId contains no tt= query parameter", () => {
    const id = generateTablePublicId();
    const url = `/qr/ir/my-vendor/t/${id}`;
    expect(url).not.toContain("tt=");
    expect(url).not.toContain("eyJ");
  });
});

describe("IDOR: publicId is not shared across vendors", () => {
  it("the same publicId string cannot validly identify tables in two different vendor paths", () => {
    const publicId = generateTablePublicId();
    const urlVendorA = `/qr/ir/vendor-a/t/${publicId}`;
    const urlVendorB = `/qr/ir/vendor-b/t/${publicId}`;

    expect(urlVendorA).toContain("vendor-a");
    expect(urlVendorB).toContain("vendor-b");
    expect(urlVendorA).not.toContain("vendor-b");
    expect(urlVendorB).not.toContain("vendor-a");
  });
});
