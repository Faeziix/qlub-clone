/**
 * wallet-service.ts — platform settlement wallet with float-guarded refund-as-payout.
 *
 * Implements PRD §6.6 (Refunds & overpayment unwind):
 *
 * - Refunds are WALLET-FUNDED PAYOUTS, never card-rail reversals.
 * - Every payout is a WalletTransaction ledger entry referencing the original Payment.
 * - PaymentStatus=refunded is set by issueRefundAsPayout (via recordPaymentRefunded),
 *   never independently.
 * - Float guard: payout is blocked when walletBalance < refundAmount (AC2).
 * - Overpayment/double-settlement surplus reuses the same path via
 *   resolveOverpaymentViaRefund (AC3).
 * - The wallet ledger (WalletTransaction table) keeps the platform balance
 *   auditable at all times (AC4).
 *
 * Schema:
 *   PlatformWallet  — singleton row holding the current balanceRial
 *   WalletTransaction — append-only ledger; type ∈ { deposit, refund_payout }
 *
 * All money values are integer rial (BigInt), matching the money.ts canonical unit.
 */

import "server-only";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";

export interface RefundAsPayoutInput {
  paymentId: string;
  amountRial: bigint;
  destinationIban: string;
  description?: string;
  payoutRef: string;
}

export type RefundResult =
  | { success: true; payoutRef: string; newBalanceRial: bigint }
  | { success: false; error: "NO_WALLET" | "INSUFFICIENT_FLOAT" | "ZERO_AMOUNT" | "PAYMENT_NOT_FOUND" };

export interface DepositFloatInput {
  amountRial: bigint;
  description?: string;
}

export type DepositResult =
  | { success: true; newBalanceRial: bigint }
  | { success: false; error: "ZERO_AMOUNT" };

export interface WalletTransactionRow {
  id: string;
  walletId: string;
  type: "deposit" | "refund_payout";
  amountRial: bigint;
  paymentId: string | null;
  payoutRef: string | null;
  description: string | null;
  createdAt: Date;
}

/**
 * Issues a refund as a ledgered payout from the platform wallet.
 *
 * Steps (all inside one DB transaction):
 *   1. Load the PlatformWallet row (SELECT FOR UPDATE semantics via $transaction).
 *   2. Guard: reject if balanceRial < amountRial (INSUFFICIENT_FLOAT).
 *   3. Decrement wallet balance by amountRial.
 *   4. Append a WalletTransaction row (type=refund_payout).
 *   5. Set Payment.status = 'refunded' via the conditional UPDATE guard.
 *
 * The caller is responsible for invoking the gateway's refundViaPayout() BEFORE
 * calling this function, and passing the resulting payoutRef here.
 * The ledger is written only if the gateway call succeeded.
 */
export async function issueRefundAsPayout(input: RefundAsPayoutInput): Promise<RefundResult> {
  if (input.amountRial <= 0n) {
    return { success: false, error: "ZERO_AMOUNT" };
  }

  return db.$transaction(async (tx) => {
    const wallet = await tx.platformWallet.findFirst();
    if (!wallet) {
      return { success: false, error: "NO_WALLET" };
    }

    if (wallet.balanceRial < input.amountRial) {
      return { success: false, error: "INSUFFICIENT_FLOAT" };
    }

    const newBalance = wallet.balanceRial - input.amountRial;

    const updatedWallet = await tx.platformWallet.update({
      where: { id: wallet.id },
      data: { balanceRial: newBalance },
    });

    await tx.walletTransaction.create({
      data: {
        id: `wtx_${nanoid(16)}`,
        walletId: wallet.id,
        type: "refund_payout",
        amountRial: input.amountRial,
        paymentId: input.paymentId,
        payoutRef: input.payoutRef,
        description: input.description ?? null,
      },
    });

    await tx.$executeRaw`
      UPDATE "Payment"
      SET status = 'refunded'
      WHERE id = ${input.paymentId}
        AND status = 'succeeded'
    `;

    return {
      success: true,
      payoutRef: input.payoutRef,
      newBalanceRial: updatedWallet.balanceRial,
    };
  });
}

/**
 * Operator pre-funds the platform wallet.
 *
 * Creates the singleton PlatformWallet row on first deposit.
 * Appends a WalletTransaction of type=deposit for full auditability.
 */
export async function depositFloat(input: DepositFloatInput): Promise<DepositResult> {
  if (input.amountRial <= 0n) {
    return { success: false, error: "ZERO_AMOUNT" };
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.platformWallet.findFirst();

    let newBalanceRial: bigint;
    let walletId: string;

    if (!existing) {
      const created = await tx.platformWallet.create({
        data: {
          id: `wallet_${nanoid(16)}`,
          balanceRial: input.amountRial,
        },
      });
      newBalanceRial = created.balanceRial;
      walletId = created.id;
    } else {
      const updated = await tx.platformWallet.update({
        where: { id: existing.id },
        data: { balanceRial: { increment: input.amountRial } },
      });
      newBalanceRial = updated.balanceRial;
      walletId = existing.id;
    }

    await tx.walletTransaction.create({
      data: {
        id: `wtx_${nanoid(16)}`,
        walletId,
        type: "deposit",
        amountRial: input.amountRial,
        description: input.description ?? null,
      },
    });

    return { success: true, newBalanceRial };
  });
}

/**
 * Returns the current platform wallet balance (integer rial).
 * Returns 0n if no wallet has been created yet.
 */
export async function getWalletBalance(): Promise<bigint> {
  const wallet = await db.platformWallet.findFirst();
  return wallet?.balanceRial ?? 0n;
}

/**
 * Returns the full wallet transaction ledger in reverse-chronological order.
 * Used by the operator settlement view and reconciliation audit.
 */
export async function getWalletLedger(): Promise<WalletTransactionRow[]> {
  const rows = await db.walletTransaction.findMany({
    orderBy: { createdAt: "desc" },
  });

  return rows as WalletTransactionRow[];
}

/**
 * Resolves an overpayment/double-settlement surplus by issuing a refund-as-payout.
 *
 * This is the AC3 path: when recordPaymentVerified detects an already-fully-paid
 * order and writes an OpsQueueEntry(reason=overpay_pending_payout_unwind), the
 * operator calls this function to unwind the surplus via the wallet.
 *
 * The function:
 *   1. Verifies the payment exists.
 *   2. Delegates to issueRefundAsPayout (same path as a regular refund — AC3).
 *
 * The caller must supply a payoutRef obtained by calling the gateway's
 * refundViaPayout() before calling this function.
 */
export async function resolveOvepaymentViaRefund(input: {
  paymentId: string;
  surplusAmountRial: bigint;
  destinationIban: string;
  payoutRef: string;
  description?: string;
}): Promise<RefundResult> {
  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true },
  });

  if (!payment) {
    return { success: false, error: "PAYMENT_NOT_FOUND" };
  }

  return issueRefundAsPayout({
    paymentId: input.paymentId,
    amountRial: input.surplusAmountRial,
    destinationIban: input.destinationIban,
    payoutRef: input.payoutRef,
    description: input.description ?? "بازپرداخت مازاد پرداخت",
  });
}
