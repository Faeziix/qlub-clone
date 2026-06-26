/**
 * GET /api/payments/callback
 *
 * The gateway redirects the browser here after the diner completes (or cancels)
 * payment. This handler performs SERVER-SIDE verification — the query string
 * params from the redirect are NEVER trusted for payment status.
 *
 * Flow:
 *   1. Read paymentId from query string (set by us when we built the callbackUrl).
 *   2. Load the pending Payment record to retrieve the trackId (ref).
 *   3. Call provider.verify(trackId) — the ONLY authoritative status source.
 *   4. Transition the payment state machine based on verified result.
 *   5. Redirect the browser to the success or failure page.
 *
 * Security invariant: the redirect query string (status, amount, etc. from the
 * gateway) is IGNORED for anything money-related. Only provider.verify() counts.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment/factory";
import { recordPaymentVerified, recordPaymentFailed } from "@/lib/payment/payment-service";

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
    return successRedirect(req, payment.orderId);
  }

  if (payment.status === "failed" || payment.status === "expired") {
    return failureRedirect(req, payment.orderId);
  }

  if (!payment.trackId) {
    await recordPaymentFailed(payment.id);
    return failureRedirect(req, payment.orderId);
  }

  const provider = getPaymentProvider();
  const verifyResult = await provider.verify(payment.trackId);

  if (verifyResult.status === "succeeded") {
    await recordPaymentVerified({
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: verifyResult.amount ?? payment.amount,
      gatewayReference: verifyResult.refNumber,
    });
    return successRedirect(req, payment.orderId);
  }

  if (verifyResult.status === "failed") {
    await recordPaymentFailed(payment.id);
    return failureRedirect(req, payment.orderId);
  }

  return NextResponse.json({ ok: false, error: "Payment still pending" }, { status: 202 });
}

function successRedirect(req: Request, orderId: string): NextResponse {
  const url = new URL(req.url);
  return NextResponse.redirect(`${url.origin}/payment/success?orderId=${orderId}`);
}

function failureRedirect(req: Request, orderId: string): NextResponse {
  const url = new URL(req.url);
  return NextResponse.redirect(`${url.origin}/payment/failed?orderId=${orderId}`);
}

function badCallbackRedirect(req: Request, reason: string): NextResponse {
  const url = new URL(req.url);
  return NextResponse.redirect(`${url.origin}/payment/failed?reason=${reason}`);
}
