/**
 * POST /api/payments/sweep
 *
 * Reconciliation sweep endpoint — to be called on a schedule (e.g. every 5
 * minutes by a cron job / platform scheduler) to resolve orphaned pending
 * and verifying payments.
 *
 * The sweep inquires every payment in pending/verifying status that is older
 * than SWEEP_STALENESS_MINUTES via the gateway's status API and resolves them:
 *
 *   inquire → succeeded  → record as verified (auto-complete)
 *   inquire → failed     → record as failed (release reservation)
 *   inquire → pending, past expiry → surface to ops queue (ambiguous)
 *   trackId missing      → record as expired (no way to inquire)
 *
 * Auth: requires SWEEP_SECRET header matching the SWEEP_SECRET env var.
 * This prevents unauthorised callers from draining rate-limit quotas at the
 * gateway. Set SWEEP_SECRET to a strong random value in the environment.
 *
 * Tenant isolation: the sweep operates across all vendors but records ops-queue
 * entries with vendorId so superadmin can filter by tenant.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment/factory";
import {
  transitionToVerifying,
  recordPaymentVerified,
  recordPaymentFailed,
  expirePayment,
} from "@/lib/payment/payment-service";
import {
  runReconciliationSweep,
  SWEEP_STALENESS_MINUTES,
} from "@/lib/payment/reconciliation-sweep";
import type { OpsQueueEntry, SweepablePayment } from "@/lib/payment/reconciliation-sweep";

const SWEEP_STALENESS_CUTOFF_MS = SWEEP_STALENESS_MINUTES * 60 * 1000;

export async function POST(req: Request): Promise<NextResponse> {
  const sweepSecret = process.env.SWEEP_SECRET;
  if (sweepSecret) {
    const authHeader = req.headers.get("x-sweep-secret");
    if (authHeader !== sweepSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - SWEEP_STALENESS_CUTOFF_MS);

  const stalePayments = await db.payment.findMany({
    where: {
      status: { in: ["pending", "verifying"] },
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      orderId: true,
      vendorId: true,
      amount: true,
      tipAmount: true,
      trackId: true,
      expiresAt: true,
    },
  });

  const provider = getPaymentProvider();
  const opsQueue: OpsQueueEntry[] = [];

  const resolvedCount = { verified: 0, failed: 0, expired: 0, ambiguous: 0 };

  await runReconciliationSweep({
    payments: stalePayments as SweepablePayment[],
    provider,
    onVerified: async (paymentId, orderId, amount, gatewayRef) => {
      await transitionToVerifying(paymentId);
      await recordPaymentVerified({ paymentId, orderId, amount, gatewayReference: gatewayRef });
      resolvedCount.verified++;
    },
    onFailed: async (paymentId) => {
      await recordPaymentFailed(paymentId);
      resolvedCount.failed++;
    },
    onExpired: async (paymentId) => {
      await expirePayment(paymentId);
      resolvedCount.expired++;
    },
    onAmbiguous: async (entry) => {
      opsQueue.push(entry);
      resolvedCount.ambiguous++;
    },
  });

  return NextResponse.json({
    ok: true,
    swept: stalePayments.length,
    resolved: resolvedCount,
    opsQueue,
  });
}
