import type { CartLine, BillBreakdown } from "./types";
import { round2 } from "./utils";

export interface PricingConfig {
  serviceChargePct: number;
  taxPct: number;
  taxInclusive: boolean;
}

export function lineTotal(line: CartLine): number {
  const modifiers = line.modifiers.reduce((s, m) => s + m.priceDelta, 0);
  return round2((line.unitPrice + modifiers) * line.quantity);
}

export function cartSubtotal(lines: CartLine[]): number {
  return round2(lines.reduce((s, l) => s + lineTotal(l), 0));
}

/**
 * Computes the full bill. When tax is inclusive (UAE VAT typically shown as
 * included), tax is reported for transparency but not added on top.
 */
export function computeBill(
  lines: CartLine[],
  config: PricingConfig,
  opts: { tip?: number; discount?: number } = {}
): BillBreakdown {
  const subtotal = cartSubtotal(lines);
  const discount = round2(opts.discount ?? 0);
  const taxable = Math.max(0, subtotal - discount);
  const serviceCharge = round2((taxable * config.serviceChargePct) / 100);

  let tax: number;
  let total: number;
  const tip = round2(opts.tip ?? 0);

  if (config.taxInclusive) {
    // tax already inside subtotal — surface the embedded portion
    const base = taxable + serviceCharge;
    tax = round2(base - base / (1 + config.taxPct / 100));
    total = round2(base + tip);
  } else {
    tax = round2(((taxable + serviceCharge) * config.taxPct) / 100);
    total = round2(taxable + serviceCharge + tax + tip);
  }

  return { subtotal, serviceCharge, tax, discount, tip, total };
}

/** Even split — returns per-person amount with remainder absorbed by first payer. */
export function evenSplit(total: number, parts: number): number[] {
  if (parts <= 1) return [round2(total)];
  const base = Math.floor((total / parts) * 100) / 100;
  const amounts = Array(parts).fill(base);
  const remainder = round2(total - base * parts);
  amounts[0] = round2(amounts[0] + remainder);
  return amounts;
}

export function tipFromPct(base: number, pct: number): number {
  return round2((base * pct) / 100);
}
