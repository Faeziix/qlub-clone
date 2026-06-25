import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPayment } from "@/lib/orders";
import { serializePaymentResult } from "@/lib/api-serializers";
import { bigintFromJson } from "@/lib/money";

const schema = z.object({
  orderId: z.string(),
  amount: z.union([z.string(), z.number()]),
  tipAmount: z.union([z.string(), z.number()]).optional(),
  method: z.enum(["ipg", "cash"]),
  splitType: z.enum(["full", "even", "items", "custom"]).optional(),
  splitMeta: z.any().optional(),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional(),
});

export async function POST(req: Request) {
  try {
    const data = schema.parse(await req.json());
    const result = await recordPayment({
      ...data,
      amount: bigintFromJson(data.amount),
      tipAmount: data.tipAmount != null ? bigintFromJson(data.tipAmount) : undefined,
    });
    return NextResponse.json({ ok: true, ...serializePaymentResult(result) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
