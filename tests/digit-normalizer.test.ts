/**
 * Unit tests for digit-normalizer.ts (issue #11).
 *
 * Verifies:
 *   - Persian digits (U+06F0–U+06F9) normalized to ASCII
 *   - Arabic-Indic digits (U+0660–U+0669) normalized to ASCII
 *   - Mixed Persian/Arabic-Indic/ASCII strings normalized correctly
 *   - Phone number normalization (11-digit Iranian mobile, E.164-ready)
 *   - Idempotency: already-normalized strings are unchanged
 *   - Non-digit characters pass through untouched
 */

import { describe, it, expect } from "vitest";
import {
  normalizeDigits,
  normalizePhoneForValidation,
  isPersianDigit,
  isArabicIndicDigit,
} from "@/lib/digit-normalizer";

describe("normalizeDigits — Persian (۰-۹) → ASCII (0-9)", () => {
  it("converts all ten Persian digits", () => {
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("idempotent: ASCII-only strings are unchanged", () => {
    expect(normalizeDigits("0123456789")).toBe("0123456789");
  });

  it("leaves non-digit characters (Persian text) untouched", () => {
    expect(normalizeDigits("قیمت: ۱۵۰۰ تومان")).toBe("قیمت: 1500 تومان");
  });

  it("handles empty string", () => {
    expect(normalizeDigits("")).toBe("");
  });

  it("handles string with only Persian text, no digits", () => {
    expect(normalizeDigits("سلام")).toBe("سلام");
  });
});

describe("normalizeDigits — Arabic-Indic (٠-٩) → ASCII (0-9)", () => {
  it("converts all ten Arabic-Indic digits", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("converts Arabic-Indic phone number", () => {
    expect(normalizeDigits("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
  });
});

describe("normalizeDigits — mixed code points", () => {
  it("converts a string with both Persian (۱) and Arabic-Indic (١) digits", () => {
    expect(normalizeDigits("۱١")).toBe("11");
  });

  it("converts a realistic Iranian phone number with Persian digits", () => {
    expect(normalizeDigits("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
  });

  it("converts a realistic phone number with Arabic-Indic digits", () => {
    expect(normalizeDigits("٠٩١٢١٢٣٤٥٦٧")).toBe("09121234567");
  });

  it("handles already-ASCII phone with leading zeros", () => {
    expect(normalizeDigits("09121234567")).toBe("09121234567");
  });

  it("handles a price string with comma separators", () => {
    expect(normalizeDigits("۱۲,۰۰۰ تومان")).toBe("12,000 تومان");
  });
});

describe("normalizePhoneForValidation — strip formatting + normalize digits", () => {
  it("removes spaces and dashes", () => {
    expect(normalizePhoneForValidation("091 21 234 567")).toBe("09121234567");
  });

  it("removes spaces from Persian-digit phone number", () => {
    expect(normalizePhoneForValidation("۰۹۱۲ ۱۲۳ ۴۵۶۷")).toBe("09121234567");
  });

  it("converts Arabic-Indic digits and strips spaces", () => {
    expect(normalizePhoneForValidation("٠٩١٢ ١٢٣ ٤٥٦٧")).toBe("09121234567");
  });

  it("converts Iranian number with +98 prefix (E.164 normalization)", () => {
    const result = normalizePhoneForValidation("+98 912 123 4567");
    expect(result).toBe("+989121234567");
  });

  it("handles an already-clean number unchanged", () => {
    expect(normalizePhoneForValidation("09121234567")).toBe("09121234567");
  });

  it("handles empty string", () => {
    expect(normalizePhoneForValidation("")).toBe("");
  });
});

describe("isPersianDigit / isArabicIndicDigit — helpers", () => {
  it("isPersianDigit is true for ۰-۹", () => {
    for (const ch of "۰۱۲۳۴۵۶۷۸۹") {
      expect(isPersianDigit(ch)).toBe(true);
    }
  });

  it("isPersianDigit is false for ASCII digits", () => {
    for (const ch of "0123456789") {
      expect(isPersianDigit(ch)).toBe(false);
    }
  });

  it("isPersianDigit is false for Arabic-Indic digits", () => {
    for (const ch of "٠١٢٣٤٥٦٧٨٩") {
      expect(isPersianDigit(ch)).toBe(false);
    }
  });

  it("isArabicIndicDigit is true for ٠-٩", () => {
    for (const ch of "٠١٢٣٤٥٦٧٨٩") {
      expect(isArabicIndicDigit(ch)).toBe(true);
    }
  });

  it("isArabicIndicDigit is false for ASCII digits", () => {
    for (const ch of "0123456789") {
      expect(isArabicIndicDigit(ch)).toBe(false);
    }
  });

  it("isArabicIndicDigit is false for Persian digits", () => {
    for (const ch of "۰۱۲۳۴۵۶۷۸۹") {
      expect(isArabicIndicDigit(ch)).toBe(false);
    }
  });
});
