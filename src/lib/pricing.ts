import type { CartLine, BillBreakdown } from "./types";

export interface PricingConfig {
  serviceChargePct: number;
  taxPct: number;
  taxInclusive: boolean;
}

export function lineTotal(line: CartLine): bigint {
  const modifierSum = line.modifiers.reduce((s, m) => s + m.priceDelta, 0n);
  return (line.unitPrice + modifierSum) * BigInt(line.quantity);
}

export function cartSubtotal(lines: CartLine[]): bigint {
  return lines.reduce((s, l) => s + lineTotal(l), 0n);
}

function applyPct(amount: bigint, pct: number): bigint {
  return (amount * BigInt(Math.round(pct * 100))) / 10_000n;
}

export function computeBill(
  lines: CartLine[],
  config: PricingConfig,
  opts: { tip?: bigint; discount?: bigint } = {}
): BillBreakdown {
  const subtotal = cartSubtotal(lines);
  const discount = opts.discount ?? 0n;
  const taxable = subtotal > discount ? subtotal - discount : 0n;
  const serviceCharge = applyPct(taxable, config.serviceChargePct);
  const tip = opts.tip ?? 0n;

  let tax: bigint;
  let total: bigint;

  if (config.taxInclusive) {
    const base = taxable + serviceCharge;
    const divisor = BigInt(Math.round((1 + config.taxPct / 100) * 10_000));
    tax = base - (base * 10_000n) / divisor;
    total = base + tip;
  } else {
    tax = applyPct(taxable + serviceCharge, config.taxPct);
    total = taxable + serviceCharge + tax + tip;
  }

  return { subtotal, serviceCharge, tax, discount, tip, total };
}

export function evenSplit(total: bigint, parts: number): bigint[] {
  if (parts <= 1) return [total];
  const partsBig = BigInt(parts);
  const base = total / partsBig;
  const amounts = Array<bigint>(parts).fill(base);
  const remainder = total - base * partsBig;
  amounts[0] = amounts[0] + remainder;
  return amounts;
}

export function tipFromPct(base: bigint, pct: number): bigint {
  return applyPct(base, pct);
}
