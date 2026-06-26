/**
 * digit-normalizer.ts — deep module for Persian/Arabic-Indic digit normalization.
 *
 * Normalizes Persian (U+06F0–U+06F9, ۰-۹) and Arabic-Indic (U+0660–U+0669, ٠-٩)
 * digits to ASCII (0-9) before any validation, parsing, or storage.
 *
 * This is mandatory before phone validation (libphonenumber-js), OTP code
 * matching, postal code validation, and any numeric input from Iranian users
 * who may type in either digit family.
 *
 * No other file should contain inline digit normalization logic.
 */

const PERSIAN_ZERO_CODEPOINT = 0x06f0;
const ARABIC_INDIC_ZERO_CODEPOINT = 0x0660;

export function isPersianDigit(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code >= PERSIAN_ZERO_CODEPOINT && code <= PERSIAN_ZERO_CODEPOINT + 9;
}

export function isArabicIndicDigit(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code >= ARABIC_INDIC_ZERO_CODEPOINT && code <= ARABIC_INDIC_ZERO_CODEPOINT + 9;
}

export function normalizeDigits(input: string): string {
  return input
    .split("")
    .map((char) => {
      const code = char.codePointAt(0);
      if (code === undefined) return char;
      if (code >= PERSIAN_ZERO_CODEPOINT && code <= PERSIAN_ZERO_CODEPOINT + 9) {
        return String(code - PERSIAN_ZERO_CODEPOINT);
      }
      if (code >= ARABIC_INDIC_ZERO_CODEPOINT && code <= ARABIC_INDIC_ZERO_CODEPOINT + 9) {
        return String(code - ARABIC_INDIC_ZERO_CODEPOINT);
      }
      return char;
    })
    .join("");
}

export function normalizePhoneForValidation(phone: string): string {
  return normalizeDigits(phone).replace(/[\s\-]/g, "");
}
