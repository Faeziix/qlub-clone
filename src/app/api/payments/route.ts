import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePayment, confirmPendingPayment } from "@/lib/orders";

const bigintFromJson = z
  .union([z.number(), z.string()])
  .transform((v) => BigInt(typeof v === "string" ? v : Math.round(v)));

const schema = z.object({
  orderId: z.string(),
  amount: bigintFromJson,
  tipAmount: bigintFromJson.optional(),
  method: z.enum(["ipg", "cash"]),
  splitType: z.enum(["full", "even", "items", "custom"]).optional(),
  splitMeta: z.any().optional(),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional(),
  idempotencyKey: z.string(),
});

/**
 * POST /api/payments
 *
 * M2 stub flow (no real IPG):
 *  1. initiatePayment — acquires FOR UPDATE lock, checks remaining balance,
 *     validates invariant, creates a pending Payment with TTL.
 *  2. confirmPendingPayment — immediately marks the leg as succeeded and
 *     updates Order.amountPaid atomically (M6 will replace this step with
 *     the real IPG gateway callback).
 *
 * The two-step path ensures split legs are reserved before any redirect
 * (acceptance criterion 3) even in the stub environment.
 *
 * Known gap (tracked for M4): orderId is not yet bound to a guest session;
 * any caller with a valid orderId can POST a payment. Tenant isolation on
 * the payment path is an M4 (Access & Anti-Abuse) deliverable.
 */
export async function POST(req: Request) {
  try {
    const data = schema.parse(await req.json());

    const { payment: pendingPayment, deduplicated } = await initiatePayment({
      orderId: data.orderId,
      amount: data.amount,
      tipAmount: data.tipAmount,
      method: data.method,
      splitType: data.splitType,
      splitMeta: data.splitMeta,
      payerName: data.payerName,
      payerEmail: data.payerEmail,
      idempotencyKey: data.idempotencyKey,
    });

    if (deduplicated && pendingPayment.status === "succeeded") {
      return NextResponse.json({
        ok: true,
        payment: pendingPayment,
        deduplicated: true,
      });
    }

    const result = await confirmPendingPayment(pendingPayment.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
