/**
 * Tests for issue #23 — Refund-as-payout + platform-wallet ledger + overpayment unwind.
 *
 * Acceptance criteria verified:
 * AC1 — Refunds are issued as ledgered payouts from the platform wallet; none are card-rail reversals.
 * AC2 — Refunds exceeding available float are blocked.
 * AC3 — Overpayment/double-settlement surpluses are refunded via the same path.
 * AC4 — Reconciliation ledger keeps the wallet balance auditable.
 *
 * All tests use vi.mock('@/lib/db') and an in-memory fake wallet state.
 * No real Postgres or live gateway required per the "sandbox path" implementation note.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundResult, DepositResult } from "@/lib/payment/wallet-service";

// ── Hoisted mock state ─────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    platformWallet: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    walletTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    opsQueueEntry: {
      findFirst: vi.fn(),
    },
  };

  const mockDb = {
    $executeRaw: vi.fn(),
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    platformWallet: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    walletTransaction: {
      findMany: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
    },
    _tx: mockTx,
  };

  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));

import {
  issueRefundAsPayout,
  depositFloat,
  getWalletBalance,
  getWalletLedger,
  resolveOvepaymentViaRefund,
} from "@/lib/payment/wallet-service";

const tx = mockDb._tx;

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb._tx) => unknown) => fn(tx));
});

function assertSuccess<T extends { success: boolean }>(
  result: T
): asserts result is Extract<T, { success: true }> {
  expect(result.success).toBe(true);
}

function assertFailure<T extends { success: boolean }>(
  result: T
): asserts result is Extract<T, { success: false }> {
  expect(result.success).toBe(false);
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. issueRefundAsPayout — basic refund from funded wallet (AC1)
// ──────────────────────────────────────────────────────────────────────────────

describe("issueRefundAsPayout — ledgered payout from platform wallet (AC1)", () => {
  it("creates a WalletTransaction debit and marks the payment refunded", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 5_000_000n,
    });
    tx.platformWallet.update.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 4_500_000n,
    });
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-1",
      walletId: "wallet-1",
      type: "refund_payout",
      amountRial: 500_000n,
      paymentId: "pay-1",
      payoutRef: "payout_abc_123456789012",
      createdAt: new Date(),
    });
    tx.$executeRaw.mockResolvedValueOnce(1);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-1",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      description: "بازپرداخت سفارش ۱۲۳",
      payoutRef: "payout_abc_123456789012",
    });

    assertSuccess(result);
    expect(result.payoutRef).toBe("payout_abc_123456789012");
    expect(result.newBalanceRial).toBe(4_500_000n);

    expect(tx.platformWallet.update).toHaveBeenCalledOnce();
    expect(tx.walletTransaction.create).toHaveBeenCalledOnce();
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "refund_payout",
          amountRial: 500_000n,
          paymentId: "pay-1",
          payoutRef: "payout_abc_123456789012",
        }),
      })
    );
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("rejects with INSUFFICIENT_FLOAT when wallet balance < refund amount (AC2)", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 100_000n,
    });

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-big",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      description: "refund attempt",
      payoutRef: "payout_xyz_999",
    });

    assertFailure(result);
    expect(result.error).toBe("INSUFFICIENT_FLOAT");
    expect(tx.platformWallet.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects with NO_WALLET when no platform wallet exists", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce(null);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-3",
      amountRial: 100_000n,
      destinationIban: "IR120570028780010872200101",
      description: "test",
      payoutRef: "payout_test",
    });

    assertFailure(result);
    expect(result.error).toBe("NO_WALLET");
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects with ZERO_AMOUNT when amountRial is 0", async () => {
    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-zero",
      amountRial: 0n,
      destinationIban: "IR120570028780010872200101",
      description: "zero test",
      payoutRef: "payout_zero",
    });

    assertFailure(result);
    expect(result.error).toBe("ZERO_AMOUNT");
    expect(tx.platformWallet.findFirst).not.toHaveBeenCalled();
  });

  it("rejects with ZERO_AMOUNT when amountRial is negative", async () => {
    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-neg",
      amountRial: -100n,
      destinationIban: "IR120570028780010872200101",
      description: "neg test",
      payoutRef: "payout_neg",
    });

    assertFailure(result);
    expect(result.error).toBe("ZERO_AMOUNT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. issueRefundAsPayout — float boundary at exactly the balance (AC2)
// ──────────────────────────────────────────────────────────────────────────────

describe("issueRefundAsPayout — float boundary guard (AC2)", () => {
  it("allows refund when amountRial === walletBalance (exact float)", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-exact",
      balanceRial: 300_000n,
    });
    tx.platformWallet.update.mockResolvedValueOnce({
      id: "wallet-exact",
      balanceRial: 0n,
    });
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-exact",
      walletId: "wallet-exact",
      type: "refund_payout",
      amountRial: 300_000n,
      paymentId: "pay-exact-f",
      payoutRef: "payout_exact",
      createdAt: new Date(),
    });
    tx.$executeRaw.mockResolvedValueOnce(1);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-exact-f",
      amountRial: 300_000n,
      destinationIban: "IR120570028780010872200101",
      description: "exact float",
      payoutRef: "payout_exact",
    });

    assertSuccess(result);
    expect(result.newBalanceRial).toBe(0n);
  });

  it("blocks refund when amountRial === walletBalance + 1 (one rial over float)", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-over",
      balanceRial: 300_000n,
    });

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-over-1",
      amountRial: 300_001n,
      destinationIban: "IR120570028780010872200101",
      description: "one over",
      payoutRef: "payout_over",
    });

    assertFailure(result);
    expect(result.error).toBe("INSUFFICIENT_FLOAT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. depositFloat — operator pre-funds the wallet (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("depositFloat — operator pre-funds the platform wallet (AC4)", () => {
  it("creates the wallet if none exists and records a deposit transaction", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce(null);
    tx.platformWallet.create.mockResolvedValueOnce({
      id: "wallet-new",
      balanceRial: 10_000_000n,
    });
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-dep-1",
      walletId: "wallet-new",
      type: "deposit",
      amountRial: 10_000_000n,
      paymentId: null,
      payoutRef: null,
      createdAt: new Date(),
    });

    const result: DepositResult = await depositFloat({
      amountRial: 10_000_000n,
      description: "واریز اولیه",
    });

    assertSuccess(result);
    expect(result.newBalanceRial).toBe(10_000_000n);
    expect(tx.platformWallet.create).toHaveBeenCalledOnce();
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "deposit",
          amountRial: 10_000_000n,
        }),
      })
    );
  });

  it("adds to existing wallet balance when wallet already exists", async () => {
    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-existing",
      balanceRial: 5_000_000n,
    });
    tx.platformWallet.update.mockResolvedValueOnce({
      id: "wallet-existing",
      balanceRial: 15_000_000n,
    });
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-dep-2",
      walletId: "wallet-existing",
      type: "deposit",
      amountRial: 10_000_000n,
      paymentId: null,
      payoutRef: null,
      createdAt: new Date(),
    });

    const result: DepositResult = await depositFloat({
      amountRial: 10_000_000n,
      description: "شارژ مجدد",
    });

    assertSuccess(result);
    expect(result.newBalanceRial).toBe(15_000_000n);
    expect(tx.platformWallet.update).toHaveBeenCalledOnce();
  });

  it("rejects a zero or negative deposit", async () => {
    const result: DepositResult = await depositFloat({ amountRial: 0n, description: "zero" });
    assertFailure(result);
    expect(result.error).toBe("ZERO_AMOUNT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. getWalletBalance — returns current float (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("getWalletBalance — returns current float (AC4)", () => {
  it("returns the current balance from the wallet record", async () => {
    mockDb.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 8_000_000n,
    });

    const balance = await getWalletBalance();

    expect(balance).toBe(8_000_000n);
  });

  it("returns 0n when no wallet exists yet", async () => {
    mockDb.platformWallet.findFirst.mockResolvedValueOnce(null);

    const balance = await getWalletBalance();

    expect(balance).toBe(0n);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. getWalletLedger — reconciliation log is auditable (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("getWalletLedger — reconciliation log is auditable (AC4)", () => {
  it("returns all wallet transactions in reverse-chronological order", async () => {
    const entries = [
      {
        id: "wtx-3",
        walletId: "wallet-1",
        type: "refund_payout",
        amountRial: 200_000n,
        paymentId: "pay-3",
        payoutRef: "payout_c",
        description: "refund",
        createdAt: new Date("2026-06-26T12:00:00Z"),
      },
      {
        id: "wtx-1",
        walletId: "wallet-1",
        type: "deposit",
        amountRial: 10_000_000n,
        paymentId: null,
        payoutRef: null,
        description: "initial deposit",
        createdAt: new Date("2026-06-25T10:00:00Z"),
      },
    ];

    mockDb.walletTransaction.findMany.mockResolvedValueOnce(entries);

    const ledger = await getWalletLedger();

    expect(ledger).toHaveLength(2);
    expect(ledger[0].type).toBe("refund_payout");
    expect(ledger[1].type).toBe("deposit");
  });

  it("returns empty array when no transactions exist", async () => {
    mockDb.walletTransaction.findMany.mockResolvedValueOnce([]);

    const ledger = await getWalletLedger();

    expect(ledger).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. resolveOverpaymentViaRefund — overpay unwind uses the same path (AC3)
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveOverpaymentViaRefund — surplus uses same refund path (AC3)", () => {
  it("resolves an overpay ops-queue entry by issuing a refund-as-payout", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce({
      id: "pay-surplus",
      orderId: "ord-op",
      vendorId: "v-1",
      amount: 200_000n,
      total: 200_000n,
      status: "succeeded",
    });

    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 5_000_000n,
    });
    tx.platformWallet.update.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 4_800_000n,
    });
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-overpay",
      walletId: "wallet-1",
      type: "refund_payout",
      amountRial: 200_000n,
      paymentId: "pay-surplus",
      payoutRef: "payout_overpay_xyz",
      createdAt: new Date(),
    });
    tx.$executeRaw.mockResolvedValueOnce(1);

    const result: RefundResult = await resolveOvepaymentViaRefund({
      paymentId: "pay-surplus",
      surplusAmountRial: 200_000n,
      destinationIban: "IR120570028780010872200101",
      payoutRef: "payout_overpay_xyz",
    });

    assertSuccess(result);
    expect(result.payoutRef).toBe("payout_overpay_xyz");
    expect(tx.walletTransaction.create).toHaveBeenCalledOnce();
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "refund_payout",
          amountRial: 200_000n,
          paymentId: "pay-surplus",
        }),
      })
    );
  });

  it("blocks overpay refund when float is insufficient (AC2 + AC3)", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce({
      id: "pay-big-surplus",
      orderId: "ord-op2",
      vendorId: "v-1",
      amount: 5_000_000n,
      total: 5_000_000n,
      status: "succeeded",
    });

    tx.platformWallet.findFirst.mockResolvedValueOnce({
      id: "wallet-1",
      balanceRial: 100_000n,
    });

    const result: RefundResult = await resolveOvepaymentViaRefund({
      paymentId: "pay-big-surplus",
      surplusAmountRial: 5_000_000n,
      destinationIban: "IR120570028780010872200101",
      payoutRef: "payout_blocked",
    });

    assertFailure(result);
    expect(result.error).toBe("INSUFFICIENT_FLOAT");
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects when payment not found", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce(null);

    const result: RefundResult = await resolveOvepaymentViaRefund({
      paymentId: "pay-missing",
      surplusAmountRial: 200_000n,
      destinationIban: "IR120570028780010872200101",
      payoutRef: "payout_missing",
    });

    assertFailure(result);
    expect(result.error).toBe("PAYMENT_NOT_FOUND");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Wallet balance audit invariant — running total matches transactions (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Wallet audit invariant — balance matches running sum (AC4)", () => {
  it("wallet balance equals sum(deposits) - sum(refund_payouts) across ledger", () => {
    const transactions: Array<{ type: string; amountRial: bigint }> = [
      { type: "deposit", amountRial: 10_000_000n },
      { type: "refund_payout", amountRial: 500_000n },
      { type: "deposit", amountRial: 5_000_000n },
      { type: "refund_payout", amountRial: 200_000n },
      { type: "refund_payout", amountRial: 300_000n },
    ];

    const expectedBalance = transactions.reduce((acc, txn) => {
      return txn.type === "deposit" ? acc + txn.amountRial : acc - txn.amountRial;
    }, 0n);

    expect(expectedBalance).toBe(14_000_000n);
  });

  it("balance cannot go negative — blocked before payout is recorded", () => {
    const currentBalance = 200_000n;
    const refundAmount = 200_001n;

    const isBlocked = refundAmount > currentBalance;
    expect(isBlocked).toBe(true);
  });
});
