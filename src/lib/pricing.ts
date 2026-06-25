import type { CartLine } from "./types";

export interface PricingConfig {
  serviceChargePct: number;
  taxPct: number;
  taxInclusive: boolean;
}

export interface BillBreakdownRial {
  subtotal: bigint;
  serviceCharge: bigint;
  tax: bigint;
  discount: bigint;
  tip: bigint;
  total: bigint;
}

function pct(amount: bigint, percent: number): bigint {
  return (amount * BigInt(Math.round(percent * 100))) / 10_000n;
}

export function lineTotal(line: CartLine): bigint {
  const modifiers = line.modifiers.reduce((s, m) => s + BigInt(m.priceDelta), 0n);
  return (BigInt(line.unitPrice) + modifiers) * BigInt(line.quantity);
}

export function cartSubtotal(lines: CartLine[]): bigint {
  return lines.reduce((s, l) => s + lineTotal(l), 0n);
}

export function computeBill(
  lines: CartLine[],
  config: PricingConfig,
  opts: { tip?: bigint; discount?: bigint } = {}
): BillBreakdownRial {
  const subtotal = cartSubtotal(lines);
  const discount = opts.discount ?? 0n;
  const taxable = subtotal > discount ? subtotal - discount : 0n;
  const serviceCharge = pct(taxable, config.serviceChargePct);
  const tip = opts.tip ?? 0n;

  let tax: bigint;
  let total: bigint;

  if (config.taxInclusive) {
    const base = taxable + serviceCharge;
    const taxFactor = BigInt(Math.round(config.taxPct * 100));
    tax = base - (base * 10_000n) / (10_000n + taxFactor);
    total = base + tip;
  } else {
    tax = pct(taxable + serviceCharge, config.taxPct);
    total = taxable + serviceCharge + tax + tip;
  }

  return { subtotal, serviceCharge, tax, discount, tip, total };
}

export function evenSplit(total: bigint, parts: number): bigint[] {
  if (parts <= 1) return [total];
  const base = total / BigInt(parts);
  const amounts = Array.from({ length: parts }, () => base);
  const remainder = total - base * BigInt(parts);
  amounts[0] = amounts[0] + remainder;
  return amounts;
}

export function tipFromPct(base: bigint, pct: number): bigint {
  return (base * BigInt(Math.round(pct * 100))) / 10_000n;
}
