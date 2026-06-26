/**
 * POST /api/payments/next-sub-charge
 *
 * Continues a ceiling-split payment by initiating the gateway session for the
 * next pending sub-charge in the group. The client calls this after each
 * sub-charge's callback returns success, passing the parentPaymentId (group ID)
 * and the just-completed paymentId so the server can identify and initiate the
 * next leg.
 *
 * Design invariants:
 * - Sub-charges are ordered by createdAt; the first pending one is the next leg.
 * - The completed sub-charge must be in status='succeeded' — if not, the group
 *   is not ready to continue (fail-closed).
 * - Returns gatewayRedirectUrl + trackId for the next leg, or { done: true }
 *   when all sub-charges have succeeded (order fully paid).
 * - Rate-limited + CSRF-checked identically to the parent POST /api/payments.
 *
 * Concurrency: only the first caller who stores a trackId wins — a second
 * concurrent call for the same next sub-charge will find trackId already set
 * and return it idempotently (gateway session re-use).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { getPaymentProvider } from "@/lib/payment/factory";
import { serializePayment } from "@/lib/api-serializers";

const schema = z.object({
  parentPaymentId: z.string().min(1).max(100),
  completedPaymentId: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`next-sub-charge:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const { parentPaymentId, completedPaymentId } = schema.parse(await req.json());

    const completed = await db.payment.findUnique({
      where: { id: completedPaymentId },
      select: { id: true, status: true, parentPaymentId: true, orderId: true, vendorId: true },
    });

    if (!completed) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    if (completed.parentPaymentId !== parentPaymentId) {
      return NextResponse.json({ ok: false, error: "Payment group mismatch" }, { status: 400 });
    }

    if (completed.status !== "succeeded") {
      return NextResponse.json(
        { ok: false, error: "Completed sub-charge is not yet succeeded" },
        { status: 409 }
      );
    }

    const allSubCharges = await db.payment.findMany({
      where: { parentPaymentId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        amount: true,
        tipAmount: true,
        total: true,
        vendorId: true,
        orderId: true,
        trackId: true,
        currency: true,
        method: true,
        reference: true,
        createdAt: true,
      },
    });

    const allSucceeded = allSubCharges.every((sc) => sc.status === "succeeded");
    if (allSucceeded) {
      return NextResponse.json({ ok: true, done: true });
    }

    const nextLeg = allSubCharges.find((sc) => sc.status === "pending");
    if (!nextLeg) {
      return NextResponse.json({ ok: true, done: true });
    }

    if (nextLeg.trackId) {
      const provider = getPaymentProvider();
      const gatewayRedirectUrl = provider.redirectUrl(nextLeg.trackId);
      return NextResponse.json({
        ok: true,
        done: false,
        payment: serializePayment(nextLeg),
        gatewayRedirectUrl,
        trackId: nextLeg.trackId,
      });
    }

    const provider = getPaymentProvider();
    const callbackUrl = buildCallbackUrl(req, nextLeg.id);

    const legIndex = allSubCharges.findIndex((sc) => sc.id === nextLeg.id);
    const description = `پرداخت سفارش (قسط ${legIndex + 1} از ${allSubCharges.length})`;

    const { ref } = await provider.request({
      merchantId: nextLeg.vendorId,
      amount: nextLeg.total,
      callbackUrl,
      orderId: nextLeg.orderId,
      description,
    });

    await db.payment.update({
      where: { id: nextLeg.id },
      data: { trackId: ref },
    });

    const gatewayRedirectUrl = provider.redirectUrl(ref);
    const remaining = allSubCharges.filter(
      (sc) => sc.id !== nextLeg.id && sc.status === "pending"
    );

    return NextResponse.json({
      ok: true,
      done: false,
      payment: serializePayment(nextLeg),
      gatewayRedirectUrl,
      trackId: ref,
      remainingSubChargeCount: remaining.length,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}

function buildCallbackUrl(req: Request, paymentId: string): string {
  const url = new URL(req.url);
  return `${url.origin}/api/payments/callback?paymentId=${paymentId}`;
}
