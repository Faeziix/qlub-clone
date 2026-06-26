/**
 * payment-service.ts — server-side payment state machine transitions.
 *
 * Implements the idempotent state machine from PRD §5.4.3 using conditional
 * updates (WHERE status = <expected>) so concurrent callbacks or reconciliation
 * sweeps cannot double-apply.
 *
 * State machine:
 *   pending → verifying  (transitionToVerifying — callback arrives, first writer wins)
 *   verifying → succeeded (recordPaymentVerified — verify=paid)
 *   verifying → failed    (recordPaymentFailed   — verify=failed)
 *   verifying → succeeded (recordPaymentVerified — "already processed", idempotent)
 *   pending/verifying → expired (expirePayment — TTL passed, no gateway success)
 *   succeeded → refunded  (recordPaymentRefunded — driven by payout record per PRD §6.6)
 *
 * Overpay handling (PRD §5.4.2 + §6.6):
 *   On recordPaymentVerified, if amountPaid is ALREADY >= total before crediting
 *   this payment, the gateway has already captured the diner's money for a surplus
 *   charge. The payment is left as 'succeeded' and an OpsQueueEntry is written with
 *   reason='overpay_pending_payout_unwind' so the operator can issue a refund-as-payout.
 *   The caller receives overpaid=true as a signal.
 *
 *   The status is NEVER set to 'refunded' here. Per PRD §6.6, status='refunded' is
 *   driven exclusively by recordPaymentRefunded(), which the operator calls AFTER a
 *   payout record is created and confirmed.
 */

import "server-only";
import { db } from "@/lib/db";
import { OrderStatus, Prisma } from "@prisma/client";
import { nanoid } from "nanoid";

/**
 * Transitions a pending payment to the verifying state.
 * This is the first step when a callback arrives — it claims the payment
 * exclusively so no concurrent callback or sweep can also start verifying it.
 *
 * Returns the number of rows updated (0 = already claimed or not found).
 * The caller MUST check the return value: 0 means another process already
 * owns this verification — abort and return idempotent success to the caller.
 */
export async function transitionToVerifying(paymentId: string): Promise<number> {
  return db.$executeRaw`
    UPDATE "Payment"
    SET status = 'verifying'
    WHERE id = ${paymentId}
      AND status = 'pending'
  `;
}

export async function recordPaymentVerified(input: {
  paymentId: string;
  orderId: string;
  amount: bigint;
  tipAmount?: bigint;
  gatewayReference?: string;
  vendorId?: string;
}): Promise<{ fullyPaid: boolean; idempotent: boolean; overpaid: boolean }> {
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
        return { fullyPaid: order ? order.amountPaid >= order.total : false, idempotent: true, overpaid: false };
      }
      return { fullyPaid: false, idempotent: false, overpaid: false };
    }

    const orderRows = await tx.$queryRaw<
      { id: string; total: bigint; amountPaid: bigint; tableId: string | null; status: OrderStatus; vendorId: string }[]
    >`
      SELECT id, total, "amountPaid", "tableId", status, "vendorId"
      FROM "Order"
      WHERE id = ${input.orderId}
      FOR UPDATE
    `;
    if (!orderRows.length) return { fullyPaid: false, idempotent: false, overpaid: false };
    const orderRow = orderRows[0];

    const alreadyFullyPaid = orderRow.amountPaid >= orderRow.total;
    if (alreadyFullyPaid) {
      const opsVendorId = input.vendorId ?? orderRow.vendorId;
      await tx.opsQueueEntry.create({
        data: {
          id: `ops_${nanoid(16)}`,
          paymentId: input.paymentId,
          orderId: input.orderId,
          vendorId: opsVendorId,
          reason: "overpay_pending_payout_unwind",
          inquiredAt: new Date(),
        },
      });
      return { fullyPaid: true, idempotent: false, overpaid: true };
    }

    const newAmountPaid = orderRow.amountPaid + input.amount;
    const fullyPaid = newAmountPaid >= orderRow.total;

    const orderUpdateData: Prisma.OrderUpdateInput = {
      amountPaid: newAmountPaid,
      status: fullyPaid ? "paid" : orderRow.status,
    };

    if (input.tipAmount && input.tipAmount > 0n) {
      orderUpdateData.tipAmount = { increment: input.tipAmount };
    }

    await tx.order.update({
      where: { id: input.orderId },
      data: orderUpdateData,
    });

    if (fullyPaid && orderRow.tableId) {
      await tx.diningTable.update({
        where: { id: orderRow.tableId },
        data: { status: "available" },
      });
    }

    return { fullyPaid, idempotent: false, overpaid: false };
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
      AND status IN ('pending', 'verifying')
      AND "expiresAt" < NOW()
  `;
}

/**
 * Transitions a succeeded payment to refunded.
 *
 * Per PRD §6.6: this function MUST only be called AFTER a payout record has
 * been created and confirmed. The caller (operator flow) is responsible for
 * creating the payout record first. Calling this directly for overpay is wrong
 * — overpay should surface via OpsQueueEntry with reason='overpay_pending_payout_unwind'
 * so the operator issues a refund-as-payout before marking this status.
 *
 * Returns the number of rows updated (0 = not found or wrong state).
 */
export async function recordPaymentRefunded(paymentId: string): Promise<number> {
  return db.$executeRaw`
    UPDATE "Payment"
    SET status = 'refunded'
    WHERE id = ${paymentId}
      AND status = 'succeeded'
  `;
}
