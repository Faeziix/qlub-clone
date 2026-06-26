/**
 * GET /api/dev/simulate-payment?ref=<ref>&action=paid|cancelled
 *
 * Development-only endpoint. Marks a simulated gateway session as paid or
 * cancelled, then redirects the browser to the stored callbackUrl so the
 * normal payment-callback flow runs end-to-end.
 *
 * This endpoint is only active when NODE_ENV !== "production" AND the active
 * provider is SimulatedPaymentAdapter. Any other environment returns 404.
 *
 * Flow:
 *   1. Dev gateway page (/dev/payment-sim/[ref]) → "Pay" button → GET here
 *   2. Mark session paid/cancelled on the singleton SimulatedPaymentAdapter
 *   3. 302 → callbackUrl  (/api/payments/callback?paymentId=xxx)
 *   4. Callback verifies via provider.verify(), writes state-machine transition
 *   5. Callback 302 → /payment/success?orderId=xxx  (or /payment/failed)
 */

import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment/factory";
import { SimulatedPaymentAdapter } from "@/lib/payment/adapters/simulated";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const provider = getPaymentProvider();
  if (!(provider instanceof SimulatedPaymentAdapter)) {
    return NextResponse.json(
      { error: "Only available with simulated payment provider" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  const action = searchParams.get("action");

  if (!ref) {
    return NextResponse.json({ error: "Missing ref" }, { status: 400 });
  }
  if (action !== "paid" && action !== "cancelled") {
    return NextResponse.json(
      { error: 'action must be "paid" or "cancelled"' },
      { status: 400 }
    );
  }

  const callbackUrl = provider.getCallbackUrl(ref);
  if (!callbackUrl) {
    return NextResponse.json(
      { error: "Session not found — it may have expired or the server restarted" },
      { status: 404 }
    );
  }

  if (action === "paid") {
    provider.simulatePaid(ref);
  } else {
    provider.simulateCancelled(ref);
  }

  return NextResponse.redirect(callbackUrl, 302);
}
