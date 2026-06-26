/**
 * reconciliation-sweep.ts — payment reconciliation sweep (PRD §6.7).
 *
 * The sweep is the real safety net for paid-but-unconfirmed orders:
 *   "Zero paid-but-unconfirmed orders left unresolved > 30 min"
 *
 * It inquires every pending/verifying payment older than SWEEP_STALENESS_MINUTES
 * via the gateway's status API and resolves them:
 *
 *   inquire → succeeded  → call onVerified  (auto-complete)
 *   inquire → failed     → call onFailed    (release reserved leg)
 *   inquire → pending    → expiresAt passed → call onExpired  (release)
 *                        → expiresAt future  → call onAmbiguous (ops queue)
 *   trackId missing      → call onExpired   (cannot inquire, release)
 *
 * The sweep is intentionally decoupled from the DB and gateway adapter via
 * dependency injection so it can be tested without Postgres or a live gateway.
 *
 * Production usage: call runReconciliationSweep() from a scheduled job route
 * or a cron-triggered API handler, passing the DB-fetched payments and the
 * active PaymentProvider.
 */

import type { PaymentProvider } from "./provider";

export interface SweepablePayment {
  id: string;
  orderId: string;
  vendorId: string;
  amount: bigint;
  tipAmount: bigint;
  trackId: string | null;
  expiresAt: Date | null;
}

export interface OpsQueueEntry {
  paymentId: string;
  orderId: string;
  vendorId: string;
  reason: string;
  inquiredAt: Date;
}

export interface ReconciliationSweepCallbacks {
  onVerified: (paymentId: string, orderId: string, amount: bigint, gatewayReference: string | undefined) => void | Promise<void>;
  onFailed: (paymentId: string) => void | Promise<void>;
  onExpired: (paymentId: string) => void | Promise<void>;
  onAmbiguous: (entry: OpsQueueEntry) => void | Promise<void>;
}

export interface ReconciliationSweepInput extends ReconciliationSweepCallbacks {
  payments: SweepablePayment[];
  provider: PaymentProvider;
}

export const SWEEP_STALENESS_MINUTES = 10;

/**
 * Processes a batch of stale payments, inquiring each one via the gateway
 * and dispatching the appropriate callback.
 *
 * This function is pure with respect to side effects: all DB writes happen
 * in the callbacks supplied by the caller so the sweep logic itself is
 * independently testable.
 */
export async function runReconciliationSweep(input: ReconciliationSweepInput): Promise<void> {
  const now = new Date();

  for (const payment of input.payments) {
    if (!payment.trackId) {
      await input.onExpired(payment.id);
      continue;
    }

    const inquireResult = await input.provider.inquire(payment.trackId);

    if (inquireResult.status === "succeeded") {
      await input.onVerified(
        payment.id,
        payment.orderId,
        payment.amount,
        undefined
      );
      continue;
    }

    if (inquireResult.status === "failed") {
      await input.onFailed(payment.id);
      continue;
    }

    const isExpired = payment.expiresAt !== null && payment.expiresAt <= now;
    if (isExpired) {
      await input.onAmbiguous({
        paymentId: payment.id,
        orderId: payment.orderId,
        vendorId: payment.vendorId,
        reason: "gateway_inquiry_pending_past_expiry",
        inquiredAt: now,
      });
      continue;
    }

    await input.onAmbiguous({
      paymentId: payment.id,
      orderId: payment.orderId,
      vendorId: payment.vendorId,
      reason: "gateway_inquiry_still_pending",
      inquiredAt: now,
    });
  }
}

/**
 * Factory for the scheduled reconciliation sweep runner.
 *
 * Returns a configured sweep runner function that can be called from a
 * scheduled job route. The caller is responsible for fetching the stale
 * payments from the DB and providing the active PaymentProvider.
 *
 * Production schedule: run every SWEEP_STALENESS_MINUTES / 2 minutes so
 * every stale payment is swept within one full interval.
 */
export function buildReconciliationSweepRunner() {
  return async function scheduledSweep(input: ReconciliationSweepInput): Promise<void> {
    return runReconciliationSweep(input);
  };
}
