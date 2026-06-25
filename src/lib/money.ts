/**
 * money.ts — single-responsibility deep module for all money operations.
 *
 * Canonical unit: integer rial (BigInt).
 * Display unit: toman (rial ÷ 10), shown to users.
 *
 * MONETARY_UNIT captures the rial→toman redenomination factor.
 * All conversions across system boundaries pass through named functions here.
 * No other file may convert between rial, toman, or wire formats.
 *
 * Boundaries:
 *   UI display        formatRialAsToman(rial)          BigInt → string toman
 *   Admin input       parseRialFromInput(tomanStr)     string toman → BigInt rial
 *   DB storage        rialForStorage / rialFromStorage  BigInt ↔ string (Prisma BigInt coercion)
 *   Gateway wire      rialForGateway / rialFromGateway  BigInt ↔ string (IPG integer string)
 *   JSON body         bigintToJson / bigintFromJson     BigInt ↔ string (fetch request bodies)
 *   localStorage      cartMoneyReplacer / cartMoneyReviver  BigInt ↔ tagged string (zustand persist)
 */

export const MONETARY_UNIT = 10n;

export function rialToToman(rial: bigint): bigint {
  return rial / MONETARY_UNIT;
}

export function tomanToRial(toman: bigint): bigint {
  return toman * MONETARY_UNIT;
}

export function parseRialFromInput(tomanInput: string): bigint {
  if (!tomanInput || !tomanInput.trim()) return 0n;
  const n = Number(tomanInput.trim());
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.floor(Math.round(n * 10)));
}

export function rialForStorage(rial: bigint): string {
  return rial.toString();
}

export function rialFromStorage(value: string | number | bigint): bigint {
  return BigInt(value);
}

export function rialForGateway(rial: bigint): string {
  return rial.toString();
}

export function rialFromGateway(value: string): bigint {
  return BigInt(value);
}

export function formatRialAsToman(rial: bigint): string {
  return rialToToman(rial).toString();
}

export function bigintToJson(rial: bigint): string {
  return rial.toString();
}

export function bigintFromJson(value: string | number): bigint {
  return BigInt(value);
}

const BIGINT_TAG = "__bigint__";

export function cartMoneyReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return `${BIGINT_TAG}${value.toString()}`;
  }
  return value;
}

export function cartMoneyReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.startsWith(BIGINT_TAG)) {
    return BigInt(value.slice(BIGINT_TAG.length));
  }
  return value;
}
