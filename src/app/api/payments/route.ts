import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePaymentLeg } from "@/lib/orders";
import { serializePayment } from "@/lib/api-serializers";
import { bigintFromJson } from "@/lib/money";
import { nanoid } from "nanoid";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";

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
    const leg = await initiatePaymentLeg({
      orderId: data.orderId,
      amount: bigintFromJson(data.amount),
      tipAmount: data.tipAmount != null ? bigintFromJson(data.tipAmount) : 0n,
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
