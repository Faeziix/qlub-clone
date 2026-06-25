import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePaymentLeg } from "@/lib/orders";
import { serializePayment } from "@/lib/api-serializers";
import { bigintFromJson } from "@/lib/money";
import { nanoid } from "nanoid";

const schema = z.object({
  orderId: z.string(),
  amount: z.union([z.string(), z.number()]),
  tipAmount: z.union([z.string(), z.number()]).optional(),
  method: z.enum(["ipg", "cash"]),
  splitType: z.enum(["full", "even", "items", "custom"]).optional(),
  splitMeta: z.any().optional(),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(req: Request) {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
