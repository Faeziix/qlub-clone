/**
 * ceiling-split.ts — IPG per-transaction ceiling handler (PRD §6.4).
 *
 * Iranian payment gateways (Shaparak) enforce per-transaction ceilings.
 * When a bill + tip exceeds the ceiling, it must be split into multiple
 * gateway sub-charges. Each sub-charge is a separate Payment row linked
 * via parentPaymentId. The order is considered paid ONLY when ALL sub-charges
 * have verified (status=succeeded).
 *
 * The concrete ceiling value MUST be verified against the chosen facilitator's
 * live API docs before production use (PRD §6.1 load-bearing caveat).
 * IPG_TRANSACTION_CEILING_RIAL is a sane default for development/testing.
 */

export const IPG_TRANSACTION_CEILING_RIAL = 50_000_000n;

export interface SubChargeChunk {
  amount: bigint;
  tipAmount: bigint;
  gatewayTotal: bigint;
}

export interface CeilingSplitResult {
  requiresSplit: boolean;
  chunks: SubChargeChunk[];
}

/**
 * Splits an amount into sub-charges, each at most ceiling rial.
 * The last chunk gets the remainder.
 *
 * Throws if amount <= 0 or ceiling <= 0.
 */
export function splitIntoSubCharges(amount: bigint, ceiling: bigint): bigint[] {
  if (amount <= 0n) throw new Error("amount must be positive");
  if (ceiling <= 0n) throw new Error("ceiling must be positive");

  const chunks: bigint[] = [];
  let remaining = amount;

  while (remaining > 0n) {
    const chunk = remaining > ceiling ? ceiling : remaining;
    chunks.push(chunk);
    remaining -= chunk;
  }

  return chunks;
}

/**
 * Computes a structured ceiling-split result for a payment leg.
 *
 * Strategy: split the TOTAL (amount + tip) by the ceiling, then allocate
 * each chunk's bill portion proportionally so that sum(chunk.amount) = amount
 * and sum(chunk.tipAmount) = tipAmount, while each chunk's gatewayTotal stays
 * at or below ceiling.
 *
 * Any integer-division remainder from the proportional allocation is appended
 * to the last chunk so totals are exact.
 */
export function computeCeilingSplit(input: {
  amount: bigint;
  tipAmount: bigint;
  ceiling: bigint;
}): CeilingSplitResult {
  const { amount, tipAmount, ceiling } = input;
  const gatewayTotal = amount + tipAmount;

  const totalChunks = splitIntoSubCharges(gatewayTotal, ceiling);

  if (totalChunks.length === 1) {
    return {
      requiresSplit: false,
      chunks: [{ amount, tipAmount, gatewayTotal }],
    };
  }

  let amountDistributed = 0n;
  let tipDistributed = 0n;

  const chunks: SubChargeChunk[] = totalChunks.map((chunkTotal, idx) => {
    const isLast = idx === totalChunks.length - 1;
    let chunkAmount: bigint;
    let chunkTip: bigint;

    if (isLast) {
      chunkAmount = amount - amountDistributed;
      chunkTip = tipAmount - tipDistributed;
    } else {
      chunkAmount = (amount * chunkTotal) / gatewayTotal;
      chunkTip = chunkTotal - chunkAmount;
      amountDistributed += chunkAmount;
      tipDistributed += chunkTip;
    }

    return { amount: chunkAmount, tipAmount: chunkTip, gatewayTotal: chunkTotal };
  });

  return { requiresSplit: true, chunks };
}

/**
 * Returns true when every sub-charge in a ceiling-split group has verified
 * (status=succeeded). Used to gate the order's fullyPaid transition — the
 * order must not be marked paid until all sub-charges confirm.
 */
export function areCeilingSplitSubChargesFullyPaid(
  subCharges: { status: "pending" | "verifying" | "succeeded" | "failed" | "expired" | "refunded" }[]
): boolean {
  if (subCharges.length === 0) return false;
  return subCharges.every((sc) => sc.status === "succeeded");
}
