import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePaymentLeg, initiateSubChargeLegs } from "@/lib/orders";
import { serializePayment } from "@/lib/api-serializers";
import { bigintFromJson } from "@/lib/money";
import { nanoid } from "nanoid";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { getPaymentProvider } from "@/lib/payment/factory";
import {
  computeCeilingSplit,
  IPG_TRANSACTION_CEILING_RIAL,
} from "@/lib/payment/ceiling-split";

const schema = z.object({
  orderId: z.string().min(1).max(100),
  amount: z.union([z.string(), z.number()]),
  tipAmount: z.union([z.string(), z.number()]).optional(),
  method: z.enum(["ipg", "cash"]),
  splitType: z.enum(["full", "even", "items", "custom"]).optional(),
  splitMeta: z.any().optional(),
  payerName: z.string().max(100).optional(),
  payerEmail: z.string().email().optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`payments:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  try {
    const data = schema.parse(await req.json());
    const idempotencyKey = data.idempotencyKey ?? `pay_${nanoid(21)}`;
    const amount = bigintFromJson(data.amount);
    const tipAmount = data.tipAmount != null ? bigintFromJson(data.tipAmount) : 0n;

    if (data.method === "ipg") {
      const splitResult = computeCeilingSplit({
        amount,
        tipAmount,
        ceiling: IPG_TRANSACTION_CEILING_RIAL,
      });

      const provider = getPaymentProvider();

      if (splitResult.requiresSplit) {
        const subLegs = await initiateSubChargeLegs({
          orderId: data.orderId,
          chunks: splitResult.chunks,
          method: data.method,
          baseIdempotencyKey: idempotencyKey,
          splitType: data.splitType,
          splitMeta: data.splitMeta,
          payerName: data.payerName,
          payerEmail: data.payerEmail,
        });

        const firstLeg = subLegs[0];
        const callbackUrl = buildCallbackUrl(req, firstLeg.id);
        const { ref } = await provider.request({
          merchantId: firstLeg.vendorId,
          amount: firstLeg.total,
          callbackUrl,
          orderId: data.orderId,
          description: `پرداخت سفارش (قسط ۱ از ${subLegs.length})`,
        });

        await storePendingTrackId(firstLeg.id, ref);
        const gatewayRedirectUrl = provider.redirectUrl(ref);

        return NextResponse.json({
          ok: true,
          payment: serializePayment(firstLeg),
          gatewayRedirectUrl,
          trackId: ref,
          subChargeCount: subLegs.length,
          remainingSubCharges: subLegs.slice(1).map((l) => serializePayment(l)),
        });
      }

      const leg = await initiatePaymentLeg({
        orderId: data.orderId,
        amount,
        tipAmount,
        method: data.method,
        idempotencyKey,
        splitType: data.splitType,
        splitMeta: data.splitMeta,
        payerName: data.payerName,
        payerEmail: data.payerEmail,
      });

      const callbackUrl = buildCallbackUrl(req, leg.id);
      const { ref } = await provider.request({
        merchantId: leg.vendorId,
        amount: leg.total,
        callbackUrl,
        orderId: data.orderId,
        description: `پرداخت سفارش`,
      });

      await storePendingTrackId(leg.id, ref);
      const gatewayRedirectUrl = provider.redirectUrl(ref);

      return NextResponse.json({
        ok: true,
        payment: serializePayment(leg),
        gatewayRedirectUrl,
        trackId: ref,
      });
    }

    const leg = await initiatePaymentLeg({
      orderId: data.orderId,
      amount,
      tipAmount,
      method: data.method,
      idempotencyKey,
      splitType: data.splitType,
      splitMeta: data.splitMeta,
      payerName: data.payerName,
      payerEmail: data.payerEmail,
    });

    return NextResponse.json({ ok: true, payment: serializePayment(leg) });
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}

function buildCallbackUrl(req: Request, paymentId: string): string {
  const url = new URL(req.url);
  return `${url.origin}/api/payments/callback?paymentId=${paymentId}`;
}

async function storePendingTrackId(paymentId: string, trackId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.payment.update({
    where: { id: paymentId },
    data: { trackId },
  });
}
