/**
 * payment-service.ts — server-side payment state machine transitions.
 *
 * These functions are called from the callback route after provider.verify()
 * returns an authoritative result. They implement the idempotent state machine
 * from §5.4.3 of the PRD using conditional updates (WHERE status = <expected>)
 * so concurrent callbacks or reconciliation sweeps cannot double-apply.
 *
 * State transitions:
 *   pending → verifying (callback arrives)
 *   verifying → succeeded (verify = paid, first writer wins)
 *   verifying → failed (verify = failed)
 *   verifying → succeeded (verify = "already processed", idempotent no-op)
 *   pending/verifying → expired (TTL passed, sweep finds no gateway success)
 *   succeeded → refunded (payout unwind for overpay/refund)
 */

import "server-only";
import { db } from "@/lib/db";
import { OrderStatus } from "@prisma/client";
import { nanoid } from "nanoid";

export async function recordPaymentVerified(input: {
  paymentId: string;
  orderId: string;
  amount: bigint;
  gatewayReference?: string;
}): Promise<{ fullyPaid: boolean; idempotent: boolean }> {
  return db.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "Payment"
      SET
        status = 'succeeded',
        "verifiedAt" = NOW(),
        "gatewayReference" = ${input.gatewayReference ?? `auto_${nanoid(10)}`}
      WHERE id = ${input.paymentId}
        AND status IN ('pending', 'verifying')
    `;

    if (updated === 0) {
      const existing = await tx.payment.findUnique({
        where: { id: input.paymentId },
        select: { status: true },
      });
      if (existing?.status === "succeeded") {
        const order = await tx.order.findUnique({ where: { id: input.orderId } });
        return { fullyPaid: order ? order.amountPaid >= order.total : false, idempotent: true };
      }
      return { fullyPaid: false, idempotent: false };
    }

    const orderRows = await tx.$queryRaw<
      { id: string; total: bigint; amountPaid: bigint; tableId: string | null; status: OrderStatus }[]
    >`
      SELECT id, total, "amountPaid", "tableId", status
      FROM "Order"
      WHERE id = ${input.orderId}
      FOR UPDATE
    `;
    if (!orderRows.length) return { fullyPaid: false, idempotent: false };
    const orderRow = orderRows[0];

    const newAmountPaid = orderRow.amountPaid + input.amount;
    const fullyPaid = newAmountPaid >= orderRow.total;

    await tx.order.update({
      where: { id: input.orderId },
      data: {
        amountPaid: newAmountPaid,
        status: fullyPaid ? "paid" : orderRow.status,
      },
    });

    if (fullyPaid && orderRow.tableId) {
      await tx.diningTable.update({
        where: { id: orderRow.tableId },
        data: { status: "available" },
      });
    }

    return { fullyPaid, idempotent: false };
  });
}

export async function recordPaymentFailed(paymentId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "Payment"
    SET status = 'failed'
    WHERE id = ${paymentId}
      AND status IN ('pending', 'verifying')
  `;
}

export async function expirePayment(paymentId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "Payment"
    SET status = 'expired'
    WHERE id = ${paymentId}
      AND status = 'pending'
      AND "expiresAt" < NOW()
  `;
}
