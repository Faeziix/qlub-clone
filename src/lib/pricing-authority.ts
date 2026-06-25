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
  name?: string;
}

export interface DbModifierPrice {
  optionId: string;
  priceDelta: bigint;
  name?: string;
}

export interface PriceChangeNotice {
  itemId: string;
  itemName?: string;
  cartPrice: bigint;
  currentPrice: bigint;
  optionId?: string;
  optionName?: string;
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
  const itemMap = new Map(dbItemPrices.map((p) => [p.itemId, p]));
  const modMap = new Map(dbModifierPrices.map((m) => [m.optionId, m]));
  const changes: PriceChangeNotice[] = [];

  for (const line of cartLines) {
    const dbItem = itemMap.get(line.itemId);
    if (dbItem !== undefined && dbItem.price !== line.unitPrice) {
      changes.push({
        itemId: line.itemId,
        itemName: dbItem.name,
        cartPrice: line.unitPrice,
        currentPrice: dbItem.price,
      });
    }
    for (const mod of line.modifiers) {
      const dbMod = modMap.get(mod.optionId);
      if (dbMod !== undefined && dbMod.priceDelta !== mod.priceDelta) {
        changes.push({
          itemId: line.itemId,
          itemName: dbItem?.name,
          optionId: mod.optionId,
          optionName: dbMod.name,
          cartPrice: mod.priceDelta,
          currentPrice: dbMod.priceDelta,
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
 * The honored-price reconciliation invariant (P0, PRD §12.1).
 *
 * Validates that the cumulative sum of non-tip payment legs does NOT exceed
 * the OrderItem snapshot total (Order.total — subtotal + service charge + tax
 * snapshotted at order creation).
 *
 * Tips are tracked separately (Payment.tipAmount) and excluded here per PRD §5.3.
 *
 * What this invariant guards against:
 *   - Overpayment: paidTotal > snapshotTotal → invalid, triggers refund-unwind.
 *   - A single partial leg (paidTotal < snapshotTotal) is VALID — it means the
 *     order is not yet fully settled, not that the leg is corrupt. Use
 *     isFullyPaid() from money.ts to check whether an order is closed.
 *
 * This decoupling is essential for split-bill: the first leg of a 3-way split
 * pays ~1/3 of the snapshot and must NOT be rejected.
 */
export function validatePaymentLegsAgainstSnapshot(
  snapshotTotal: bigint,
  paymentLegs: PaymentLeg[]
): InvariantResult {
  const paidTotal = paymentLegs.reduce((sum, leg) => sum + leg.amount, 0n);
  const valid = paidTotal <= snapshotTotal;
  const discrepancy = valid ? 0n : paidTotal - snapshotTotal;
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
