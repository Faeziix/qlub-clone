/**
 * money.ts — deep module for all integer-rial money operations.
 *
 * Rules enforced by this module:
 *  1. All money is stored and computed as integer rial in BigInt.
 *  2. This is the ONLY place conversions between units are performed.
 *  3. No floats, no round2, no epsilon comparisons.
 *
 * Conversion boundary table:
 *  Storage / ledger       → integer rial (BigInt)  — identity
 *  Gateway IPG amounts    → integer rial (BigInt)  — factor 1 (re-verify per provider before go-live)
 *  Restaurant settlement  → toman (BigInt)         — rial / 10n
 *  Diner UI display       → toman string           — formatRialAsToman
 *  Redenomination         → new unit               — one-time migration by legislated factor
 */

/**
 * Canonical storage unit constant.
 * If/when Iran's rial→toman redenomination takes legal effect, change this
 * constant and run a single data migration (multiply or divide all money
 * columns by the legislated factor) rather than hunting every call site.
 */
export const MONETARY_UNIT = "IRR" as const;

/**
 * The redenomination factor (1 toman = 10 rial).
 * Single source of truth so a future statutory change needs one edit here.
 */
const RIAL_PER_TOMAN = 10n;

// ─────────────────────────── rial ↔ toman ─────────────────────────────────────

export function rialToToman(rial: bigint): bigint {
  return rial / RIAL_PER_TOMAN;
}

export function tomanToRial(toman: bigint): bigint {
  return toman * RIAL_PER_TOMAN;
}

// ─────────────────────────── gateway unit ─────────────────────────────────────

/**
 * Converts internal rial to the unit expected by the payment gateway.
 *
 * WARNING: The factor here is 1 (gateway expects rial) based on common Iranian
 * IPG practice. However, some facilitators quote toman. This MUST be re-verified
 * against the chosen facilitator's live API docs before Phase 4 build. If the
 * gateway quotes toman, change gatewayFactor to RIAL_PER_TOMAN.
 */
const GATEWAY_RIAL_FACTOR = 1n;

export function rialToGatewayUnit(rial: bigint): bigint {
  return rial / GATEWAY_RIAL_FACTOR;
}

export function gatewayUnitToRial(gatewayUnit: bigint): bigint {
  return gatewayUnit * GATEWAY_RIAL_FACTOR;
}

// ─────────────────────────── display ─────────────────────────────────────────

/**
 * Formats a rial amount as a toman string with comma separators.
 * Never uses Intl.NumberFormat with currency: 'IRR' — IRR is not
 * supported correctly by all runtime environments for toman display.
 *
 * Example: 1_000_000n rial → "100,000"  (shown as 100,000 تومان in UI)
 */
export function formatRialAsToman(rial: bigint): string {
  const toman = rialToToman(rial);
  return toman.toLocaleString("en-US");
}

/**
 * Parses a user-facing toman input string into rial BigInt.
 * Strips commas (thousands separators) before parsing.
 * Input is assumed to be in toman; output is in rial.
 */
export function parseRialFromInput(input: string): bigint {
  const cleaned = input.replace(/,/g, "").trim();
  if (!cleaned) return 0n;
  const toman = BigInt(cleaned);
  return tomanToRial(toman);
}

// ─────────────────────────── payment utilities ───────────────────────────────

/**
 * Determines if an order is fully paid using exact integer comparison.
 * Replaces the old `amountPaid >= total - 0.01` epsilon hack.
 * Tips are NOT included in total; only non-tip payment legs count.
 */
export function isFullyPaid(amountPaidRial: bigint, orderTotalRial: bigint): boolean {
  return amountPaidRial >= orderTotalRial;
}
