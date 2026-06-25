import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPayment } from "@/lib/orders";

const bigintFromJson = z
  .union([z.number(), z.string()])
  .transform((v) => BigInt(typeof v === "string" ? v : Math.round(v)));

const schema = z.object({
  orderId: z.string(),
  amount: bigintFromJson,
  tipAmount: bigintFromJson.optional(),
  method: z.enum(["card", "apple_pay", "google_pay", "tabby", "benefit", "cash"]),
  splitType: z.enum(["full", "even", "items", "custom"]).optional(),
  splitMeta: z.any().optional(),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional(),
});

export async function POST(req: Request) {
  try {
    const data = schema.parse(await req.json());
    const result = await recordPayment(data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
