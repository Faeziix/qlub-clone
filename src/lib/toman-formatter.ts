/**
 * toman-formatter.ts — deep module for Persian toman display formatting.
 *
 * Canonical storage unit is integer rial (BigInt) in money.ts.
 * This module is the single place that converts rial to a human-readable
 * Persian toman string for display in the diner and owner UIs.
 *
 * Rules:
 *   - Never use Intl style:'currency' with 'IRR' — it renders incorrectly for
 *     Iranian users and does not reflect the colloquial toman convention.
 *   - Always render amounts with Persian numerals (۰-۹).
 *   - Below TOMAN_HEZAR_THRESHOLD_RIAL: display as "{toman} تومان"
 *     e.g. 50_000 rial = 5_000 تومان
 *   - At or above TOMAN_HEZAR_THRESHOLD_RIAL: display as "{thousands} هزار تومان"
 *     e.g. 120_000 rial = 12_000 toman = ۱۲ هزار تومان
 *     (this reflects the common Iranian shorthand: ۱۵۰ هزار تومان for 150,000 toman)
 *
 * The threshold is 100_000 rial (= 10_000 toman).
 * Amounts that are not exact multiples of 1_000 toman are displayed in plain
 * toman even if above the threshold, to avoid misleading rounding.
 */

import { rialToToman } from "./money";

export const TOMAN_HEZAR_THRESHOLD_RIAL = 100_000n;

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

export function latinDigitsToPersian(input: string): string {
  return input
    .split("")
    .map((ch) => {
      const digit = ch.charCodeAt(0) - 48;
      if (digit >= 0 && digit <= 9) return PERSIAN_DIGITS[digit];
      return ch;
    })
    .join("");
}

export function persianDigitsToLatin(input: string): string {
  return input
    .split("")
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (code === undefined) return ch;
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      return ch;
    })
    .join("");
}

function toPersianNumeral(n: bigint): string {
  return latinDigitsToPersian(n.toString());
}

function formatTomanValue(toman: bigint): string {
  if (toman === 0n) return "۰ تومان";

  const isExactThousands = toman % 1_000n === 0n;
  const isAboveHezarThreshold = toman >= 10_000n;

  if (isAboveHezarThreshold && isExactThousands) {
    const hezar = toman / 1_000n;
    return `${toPersianNumeral(hezar)} هزار تومان`;
  }

  return `${toPersianNumeral(toman)} تومان`;
}

export function formatRialAsTomanPersian(rial: bigint): string {
  const toman = rialToToman(rial);
  return formatTomanValue(toman);
}

export function formatTomanAmountPersian(toman: bigint): string {
  return formatTomanValue(toman);
}

export function formatRialAsTomanLatin(rial: bigint): string {
  const toman = rialToToman(rial);
  if (toman === 0n) return "0 T";
  const isExactThousands = toman % 1_000n === 0n;
  const isAboveHezarThreshold = toman >= 10_000n;
  if (isAboveHezarThreshold && isExactThousands) {
    return `${(toman / 1_000n).toLocaleString("en")}K T`;
  }
  return `${toman.toLocaleString("en")} T`;
}
