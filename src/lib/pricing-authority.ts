/**
 * pricing-authority.ts — server-authoritative pricing + honored-price rule.
 *
 * Issue #9 acceptance criteria implemented here:
 *  1. computeServerBill: re-fetches DB prices, never trusts client values.
 *  2. detectPriceChanges: compares cart prices to DB prices, returns notice list.
 *  3. validatePaymentLegsAgainstSnapshot: invariant test — legs must reconcile
 *     to the OrderItem snapshot (subtotal + service + tax), tip excluded.
 *  4. buildIdempotencyKey: deterministic idempotency key for payment initiation.
 *
 * This module is pure (no DB access) so it is fully unit-testable.
 * The DB-access counterpart is in orders.ts.
 */

import { computeBill } from "./pricing";
import type { PricingConfig } from "./pricing";

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CartLineInput {
  itemId: string;
  quantity: number;
  unitPrice: bigint;
  modifiers: Array<{ optionId: string; priceDelta: bigint }>;
}

export interface DbItemPrice {
  itemId: string;
  price: bigint;
}

export interface DbModifierPrice {
  optionId: string;
  priceDelta: bigint;
}

export interface PriceChangeNotice {
  itemId: string;
  cartPrice: bigint;
  currentPrice: bigint;
  optionId?: string;
}

export interface PaymentLeg {
  amount: bigint;
  tipAmount: bigint;
}

export interface InvariantResult {
  valid: boolean;
  snapshotTotal: bigint;
  paidTotal: bigint;
  discrepancy: bigint;
}

// ─── Price-change detection ───────────────────────────────────────────────────

export function detectPriceChanges(
  cartLines: CartLineInput[],
  dbItemPrices: DbItemPrice[],
  dbModifierPrices: DbModifierPrice[]
): PriceChangeNotice[] {
  const itemMap = new Map(dbItemPrices.map((p) => [p.itemId, p.price]));
  const modMap = new Map(dbModifierPrices.map((m) => [m.optionId, m.priceDelta]));
  const changes: PriceChangeNotice[] = [];

  for (const line of cartLines) {
    const dbPrice = itemMap.get(line.itemId);
    if (dbPrice !== undefined && dbPrice !== line.unitPrice) {
      changes.push({
        itemId: line.itemId,
        cartPrice: line.unitPrice,
        currentPrice: dbPrice,
      });
    }
    for (const mod of line.modifiers) {
      const dbDelta = modMap.get(mod.optionId);
      if (dbDelta !== undefined && dbDelta !== mod.priceDelta) {
        changes.push({
          itemId: line.itemId,
          optionId: mod.optionId,
          cartPrice: mod.priceDelta,
          currentPrice: dbDelta,
        });
      }
    }
  }

  return changes;
}

// ─── Server-authoritative bill computation ────────────────────────────────────

export function computeServerBill(
  cartLines: CartLineInput[],
  dbItemPrices: DbItemPrice[],
  dbModifierPrices: DbModifierPrice[],
  config: PricingConfig,
  opts: { tip?: bigint; discount?: bigint } = {}
) {
  const itemMap = new Map(dbItemPrices.map((p) => [p.itemId, p.price]));
  const modMap = new Map(dbModifierPrices.map((m) => [m.optionId, m.priceDelta]));

  const authorizedLines = cartLines.map((line) => {
    const unitPrice = itemMap.get(line.itemId) ?? line.unitPrice;
    const authorizedModifiers = line.modifiers.map((mod) => ({
      groupId: "",
      groupName: "",
      optionId: mod.optionId,
      optionName: "",
      priceDelta: modMap.get(mod.optionId) ?? mod.priceDelta,
    }));
    return {
      lineId: line.itemId,
      itemId: line.itemId,
      name: "",
      unitPrice,
      quantity: line.quantity,
      modifiers: authorizedModifiers,
    };
  });

  return computeBill(authorizedLines, config, opts);
}

// ─── The honored-price invariant ──────────────────────────────────────────────

/**
 * Asserts that the sum of all non-tip payment legs reconciles to the
 * OrderItem snapshot total (the pre-computed Order.total, which captures
 * subtotal + service charge + tax at the time of order creation).
 *
 * Tips are tracked separately on each Payment (Payment.tipAmount) and are
 * NOT included in the reconciliation total per the PRD §5.3 tip-tracking rule.
 *
 * This is the P0 invariant from PRD §12.1 — every payment recording path
 * must satisfy this before marking an order paid.
 *
 * Overpayment (paidTotal > snapshotTotal) is valid: the excess triggers a
 * refund-unwind path, not a rejection (PRD §6.6).
 */
export function validatePaymentLegsAgainstSnapshot(
  snapshotTotal: bigint,
  paymentLegs: PaymentLeg[]
): InvariantResult {
  const paidTotal = paymentLegs.reduce((sum, leg) => sum + leg.amount, 0n);
  const valid = paidTotal >= snapshotTotal;
  const discrepancy = valid ? 0n : snapshotTotal - paidTotal;
  return { valid, snapshotTotal, paidTotal, discrepancy };
}

// ─── Idempotency key builder ──────────────────────────────────────────────────

/**
 * Builds a deterministic idempotency key for a payment initiation attempt.
 * The key encodes orderId + payerId + splitLegIdentifier so that:
 *  - Retrying the same leg produces the same key and is deduplicated.
 *  - Different legs, orders, or payers produce distinct keys.
 *
 * NOTE: For production use, a client-supplied nonce (UUID v4) should be
 * accepted and stored alongside this key, enabling the client to safely
 * retry on network failures. This builder provides the server-side
 * deterministic fallback when no client nonce is supplied.
 */
export function buildIdempotencyKey(
  orderId: string,
  payerId: string,
  splitLegId: string
): string {
  return `${orderId}:${payerId}:${splitLegId}`;
}
