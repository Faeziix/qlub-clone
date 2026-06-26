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
  destinationIban: string | null;
  description: string | null;
  createdAt: Date;
}

export async function issueRefundAsPayout(input: RefundAsPayoutInput): Promise<RefundResult> {
  if (input.amountRial <= 0n) {
    return { success: false, error: "ZERO_AMOUNT" };
  }

  return db.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<{ id: string; balanceRial: bigint }[]>`
      SELECT id, "balanceRial"
      FROM "PlatformWallet"
      LIMIT 1
      FOR UPDATE
    `;

    if (!lockedRows.length) {
      return { success: false, error: "NO_WALLET" };
    }

    const wallet = lockedRows[0];

    if (wallet.balanceRial < input.amountRial) {
      return { success: false, error: "INSUFFICIENT_FLOAT" };
    }

    const updatedRows = await tx.$queryRaw<{ balanceRial: bigint }[]>`
      UPDATE "PlatformWallet"
      SET "balanceRial" = "balanceRial" - ${input.amountRial}
      WHERE id = ${wallet.id}
        AND "balanceRial" >= ${input.amountRial}
      RETURNING "balanceRial"
    `;

    if (!updatedRows.length) {
      return { success: false, error: "INSUFFICIENT_FLOAT" };
    }

    await tx.walletTransaction.create({
      data: {
        id: `wtx_${nanoid(16)}`,
        walletId: wallet.id,
        type: "refund_payout",
        amountRial: input.amountRial,
        paymentId: input.paymentId,
        payoutRef: input.payoutRef,
        destinationIban: input.destinationIban,
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
      newBalanceRial: updatedRows[0].balanceRial,
    };
  });
}

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

export async function getWalletBalance(): Promise<bigint> {
  const wallet = await db.platformWallet.findFirst();
  return wallet?.balanceRial ?? 0n;
}

export async function getWalletLedger(): Promise<WalletTransactionRow[]> {
  const rows = await db.walletTransaction.findMany({
    orderBy: { createdAt: "desc" },
  });

  return rows as WalletTransactionRow[];
}

export async function resolveOverpaymentViaRefund(input: {
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
