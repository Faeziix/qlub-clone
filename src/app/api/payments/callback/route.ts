/**
 * GET /api/payments/callback
 *
 * The gateway redirects the browser here after the diner completes (or cancels)
 * payment. This handler performs SERVER-SIDE verification — the query string
 * params from the redirect are NEVER trusted for payment status.
 *
 * Full state machine flow:
 *   1. Read paymentId from query string (set by us when we built the callbackUrl).
 *   2. Load the pending Payment record to retrieve the trackId (ref).
 *   3. transitionToVerifying(paymentId) — atomic claim; 0 rows = already claimed.
 *   4. Call provider.verify(trackId) — the ONLY authoritative status source.
 *   5. Transition to succeeded / failed based on verify result.
 *   6. Redirect the browser to the success or failure page.
 *
 * Security invariant: the redirect query string (status, amount, etc. from the
 * gateway) is IGNORED for anything money-related. Only provider.verify() counts.
 *
 * Concurrency invariant: transitionToVerifying uses a conditional UPDATE
 * (WHERE status='pending') so only one concurrent callback can claim the
 * payment. The second callback sees 0 rows updated and takes the idempotent
 * early-return path.
 *
 * Amount-mismatch invariant: if the gateway confirms payment but the verified
 * amount does not match the reserved total, we write an OpsQueueEntry for
 * manual review rather than silently failing a payment the gateway already
 * captured (PRD §5.4.3 verified-with-mismatch handling).
 */

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment/factory";
import {
  transitionToVerifying,
  recordPaymentVerified,
  recordPaymentFailed,
} from "@/lib/payment/payment-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");

  if (!paymentId) {
    return badCallbackRedirect(req, "missing-payment-id");
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, trackId: true, status: true, amount: true, tipAmount: true, orderId: true, vendorId: true },
  });

  if (!payment) {
    return badCallbackRedirect(req, "payment-not-found");
  }

  if (payment.status === "succeeded") {
    return successRedirect(req, payment.orderId, payment.id);
  }

  if (payment.status === "failed" || payment.status === "expired") {
    return failureRedirect(req, payment.orderId);
  }

  if (!payment.trackId) {
    await recordPaymentFailed(payment.id);
    return failureRedirect(req, payment.orderId);
  }

  if (payment.status === "verifying") {
    return pendingRedirect(req, payment.orderId);
  }

  const claimed = await transitionToVerifying(payment.id);
  if (claimed === 0) {
    return pendingRedirect(req, payment.orderId);
  }

  const provider = getPaymentProvider();
  const verifyResult = await provider.verify(payment.trackId);

  if (verifyResult.status === "succeeded") {
    const reservedTotal = payment.amount + payment.tipAmount;
    const verifiedAmount = verifyResult.amount ?? reservedTotal;

    if (verifiedAmount !== reservedTotal) {
      await db.opsQueueEntry.create({
        data: {
          id: `ops_${nanoid(16)}`,
          paymentId: payment.id,
          orderId: payment.orderId,
          vendorId: payment.vendorId,
          reason: `amount_mismatch:reserved=${reservedTotal},verified=${verifiedAmount}`,
          inquiredAt: new Date(),
        },
      });
      return pendingRedirect(req, payment.orderId);
    }

    await recordPaymentVerified({
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      tipAmount: payment.tipAmount,
      vendorId: payment.vendorId,
      gatewayReference: verifyResult.refNumber,
    });
    return successRedirect(req, payment.orderId, payment.id);
  }

  if (verifyResult.status === "failed") {
    await recordPaymentFailed(payment.id);
    return failureRedirect(req, payment.orderId);
  }

  return pendingRedirect(req, payment.orderId);
}

function successRedirect(req: Request, orderId: string, paymentId: string): NextResponse {
  const { origin } = new URL(req.url);
  return NextResponse.redirect(
    `${origin}/payment/success?orderId=${orderId}&paymentId=${paymentId}`
  );
}

function failureRedirect(req: Request, orderId: string): NextResponse {
  const { origin } = new URL(req.url);
  return NextResponse.redirect(`${origin}/payment/failed?orderId=${orderId}`);
}

function pendingRedirect(req: Request, orderId: string): NextResponse {
  const { origin } = new URL(req.url);
  return NextResponse.redirect(`${origin}/payment/pending?orderId=${orderId}`);
}

function badCallbackRedirect(req: Request, reason: string): NextResponse {
  const { origin } = new URL(req.url);
  return NextResponse.redirect(`${origin}/payment/failed?reason=${encodeURIComponent(reason)}`);
}
