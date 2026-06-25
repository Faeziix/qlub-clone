/**
 * Unit tests for toman-formatter.ts (issue #11).
 *
 * Verifies:
 *   - Persian numeral rendering (digits 0-9 → ۰-۹)
 *   - Toman display: simple toman for smaller amounts
 *   - هزار تومان display: ×1000 implied-thousands shorthand for large amounts
 *   - formatRialAsTomanPersian renders with Persian numerals and unit suffix
 *   - formatTomanAmount renders a plain toman bigint for display
 *   - No IRR Intl style used (formatter is fully custom)
 *   - Edge cases: zero, negative (undefined), very large amounts
 *   - Threshold: amounts >= 10_000 toman (100_000 rial) render with هزار تومان shorthand
 */

import { describe, it, expect } from "vitest";
import {
  latinDigitsToPersian,
  persianDigitsToLatin,
  formatRialAsTomanPersian,
  formatTomanAmountPersian,
  TOMAN_HEZAR_THRESHOLD_RIAL,
} from "@/lib/toman-formatter";

describe("latinDigitsToPersian — convert ASCII digits to Persian numerals", () => {
  it("converts all ten digits", () => {
    expect(latinDigitsToPersian("0123456789")).toBe("۰۱۲۳۴۵۶۷۸۹");
  });

  it("leaves non-digit characters untouched", () => {
    expect(latinDigitsToPersian("15,000")).toBe("۱۵,۰۰۰");
  });

  it("handles empty string", () => {
    expect(latinDigitsToPersian("")).toBe("");
  });

  it("converts mixed content", () => {
    expect(latinDigitsToPersian("قیمت: 12000 تومان")).toBe("قیمت: ۱۲۰۰۰ تومان");
  });
});

describe("persianDigitsToLatin — convert Persian/Arabic-Indic numerals to ASCII", () => {
  it("converts Persian (۰-۹) to ASCII (0-9)", () => {
    expect(persianDigitsToLatin("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("converts Arabic-Indic (٠-٩) to ASCII (0-9)", () => {
    expect(persianDigitsToLatin("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("handles a string with both Persian and ASCII digits", () => {
    expect(persianDigitsToLatin("۱2۳")).toBe("123");
  });

  it("leaves non-digit characters untouched", () => {
    expect(persianDigitsToLatin("قیمت: ۱۵,۰۰۰ تومان")).toBe("قیمت: 15,000 تومان");
  });

  it("handles empty string", () => {
    expect(persianDigitsToLatin("")).toBe("");
  });

  it("is the inverse of latinDigitsToPersian for digit-only strings", () => {
    const original = "1234567890";
    expect(persianDigitsToLatin(latinDigitsToPersian(original))).toBe(original);
  });
});

describe("TOMAN_HEZAR_THRESHOLD_RIAL — implied-thousands threshold", () => {
  it("is 100_000n rial (= 10_000 toman)", () => {
    expect(TOMAN_HEZAR_THRESHOLD_RIAL).toBe(100_000n);
  });
});

describe("formatRialAsTomanPersian — main display formatter", () => {
  it("formats a small amount in plain toman with Persian digits and تومان", () => {
    const result = formatRialAsTomanPersian(50_000n);
    expect(result).toContain("تومان");
    expect(result).not.toContain("هزار");
    expect(result).toMatch(/[۰-۹]/);
    expect(result).toContain("۵۰۰۰");
  });

  it("formats zero as ۰ تومان", () => {
    const result = formatRialAsTomanPersian(0n);
    expect(result).toBe("۰ تومان");
  });

  it("formats a large amount (>= 10_000 toman) with هزار تومان", () => {
    const result = formatRialAsTomanPersian(1_200_000n);
    expect(result).toContain("هزار تومان");
    expect(result).toMatch(/[۰-۹]/);
  });

  it("120_000 rial = 12_000 toman = 12 هزار تومان", () => {
    const result = formatRialAsTomanPersian(120_000n);
    expect(result).toContain("هزار تومان");
    expect(result).toContain("۱۲");
  });

  it("99_990 rial = 9_999 toman (below threshold) renders plain تومان", () => {
    const result = formatRialAsTomanPersian(99_990n);
    expect(result).toContain("تومان");
    expect(result).not.toContain("هزار");
  });

  it("exact threshold (100_000 rial = 10_000 toman) renders هزار تومان", () => {
    const result = formatRialAsTomanPersian(100_000n);
    expect(result).toContain("هزار تومان");
  });

  it("output contains only Persian numerals (no ASCII digits)", () => {
    const result = formatRialAsTomanPersian(1_500_000n);
    expect(result).not.toMatch(/[0-9]/);
  });

  it("formats 1_500_000 rial = 150_000 toman = 150 هزار تومان", () => {
    const result = formatRialAsTomanPersian(1_500_000n);
    expect(result).toContain("هزار تومان");
    expect(result).toContain("۱۵۰");
  });

  it("formats large receipt amount: 4_500_000 rial = 450 هزار تومان", () => {
    const result = formatRialAsTomanPersian(4_500_000n);
    expect(result).toContain("هزار تومان");
    expect(result).toContain("۴۵۰");
  });

  it("formats amount not divisible by 1000 toman: 12_500 rial = 1_250 toman (plain)", () => {
    const result = formatRialAsTomanPersian(12_500n);
    expect(result).toContain("تومان");
    expect(result).not.toContain("هزار");
    expect(result).toContain("۱۲۵۰");
  });

  it("output never contains Latin digits", () => {
    for (const rial of [0n, 10n, 100n, 1000n, 10_000n, 100_000n, 1_000_000n]) {
      const result = formatRialAsTomanPersian(rial);
      expect(result).not.toMatch(/[0-9]/);
    }
  });
});

describe("formatTomanAmountPersian — display a pre-computed toman bigint", () => {
  it("formats 5000 toman as ۵۰۰۰ تومان (below threshold)", () => {
    const result = formatTomanAmountPersian(5_000n);
    expect(result).toContain("تومان");
    expect(result).not.toContain("هزار");
    expect(result).toContain("۵۰۰۰");
  });

  it("formats 15000 toman as ۱۵ هزار تومان (above threshold)", () => {
    const result = formatTomanAmountPersian(15_000n);
    expect(result).toContain("هزار تومان");
    expect(result).toContain("۱۵");
  });

  it("formats 0 toman as ۰ تومان", () => {
    expect(formatTomanAmountPersian(0n)).toBe("۰ تومان");
  });

  it("output never contains Latin digits", () => {
    for (const toman of [0n, 100n, 9_999n, 10_000n, 150_000n]) {
      expect(formatTomanAmountPersian(toman)).not.toMatch(/[0-9]/);
    }
  });
});
