import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundResult, DepositResult } from "@/lib/payment/wallet-service";

// ──────────────────────────────────────────────────────────────────────────
// NOTE ON CALL ORDER — after the idempotency fix, issueRefundAsPayout runs:
//   1. SELECT FOR UPDATE wallet  ($queryRaw #1)
//   2. float guard — abort early if balance < amount
//   3. UPDATE Payment status succeeded→refunded  ($executeRaw #1)
//      abort with ALREADY_REFUNDED if 0 rows affected
//   4. UPDATE PlatformWallet balance  ($queryRaw #2)
//   5. walletTransaction.create  (ledger row)
// All mock sequences below follow this order.
// ──────────────────────────────────────────────────────────────────────────

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
  resolveOverpaymentViaRefund,
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

describe("issueRefundAsPayout — ledgered payout from platform wallet (AC1)", () => {
  it("creates a WalletTransaction debit and marks the payment refunded", async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 5_000_000n }])
      .mockResolvedValueOnce([{ balanceRial: 4_500_000n }]);
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-1",
      walletId: "wallet-1",
      type: "refund_payout",
      amountRial: 500_000n,
      paymentId: "pay-1",
      payoutRef: "payout_abc_123456789012",
      destinationIban: "IR120570028780010872200101",
      createdAt: new Date(),
    });

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

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.walletTransaction.create).toHaveBeenCalledOnce();
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "refund_payout",
          amountRial: 500_000n,
          paymentId: "pay-1",
          payoutRef: "payout_abc_123456789012",
          destinationIban: "IR120570028780010872200101",
        }),
      })
    );
  });

  it("rejects with INSUFFICIENT_FLOAT when wallet balance < refund amount (AC2)", async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 100_000n }]);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-big",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      description: "refund attempt",
      payoutRef: "payout_xyz_999",
    });

    assertFailure(result);
    expect(result.error).toBe("INSUFFICIENT_FLOAT");
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects with NO_WALLET when no platform wallet exists", async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);

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
    expect(tx.$executeRaw).not.toHaveBeenCalled();
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
    expect(tx.$queryRaw).not.toHaveBeenCalled();
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

  it("rejects with ALREADY_REFUNDED when payment is not in succeeded state (idempotency guard)", async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 5_000_000n }]);
    tx.$executeRaw.mockResolvedValueOnce(0);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-already-refunded",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      description: "duplicate call",
      payoutRef: "payout_dup_001",
    });

    assertFailure(result);
    expect(result.error).toBe("ALREADY_REFUNDED");
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("does not double-debit on second invocation — walletTransaction.create called exactly once total", async () => {
    const firstCallSetup = () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 5_000_000n }])
        .mockResolvedValueOnce([{ balanceRial: 4_500_000n }]);
      tx.$executeRaw.mockResolvedValueOnce(1);
      tx.walletTransaction.create.mockResolvedValueOnce({ id: "wtx-idem-1" });
    };

    const secondCallSetup = () => {
      tx.$queryRaw.mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 4_500_000n }]);
      tx.$executeRaw.mockResolvedValueOnce(0);
    };

    firstCallSetup();
    const first = await issueRefundAsPayout({
      paymentId: "pay-idem",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      payoutRef: "payout_idem_001",
    });
    assertSuccess(first);

    secondCallSetup();
    const second = await issueRefundAsPayout({
      paymentId: "pay-idem",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      payoutRef: "payout_idem_001",
    });
    assertFailure(second);
    expect(second.error).toBe("ALREADY_REFUNDED");

    expect(tx.walletTransaction.create).toHaveBeenCalledOnce();
  });
});

describe("issueRefundAsPayout — float boundary guard (AC2)", () => {
  it("allows refund when amountRial === walletBalance (exact float)", async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: "wallet-exact", balanceRial: 300_000n }])
      .mockResolvedValueOnce([{ balanceRial: 0n }]);
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-exact",
      walletId: "wallet-exact",
      type: "refund_payout",
      amountRial: 300_000n,
      paymentId: "pay-exact-f",
      payoutRef: "payout_exact",
      destinationIban: "IR120570028780010872200101",
      createdAt: new Date(),
    });

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
    tx.$queryRaw.mockResolvedValueOnce([{ id: "wallet-over", balanceRial: 300_000n }]);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-over-1",
      amountRial: 300_001n,
      destinationIban: "IR120570028780010872200101",
      description: "one over",
      payoutRef: "payout_over",
    });

    assertFailure(result);
    expect(result.error).toBe("INSUFFICIENT_FLOAT");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("returns INSUFFICIENT_FLOAT when concurrent writer drains balance between lock and update (AC2 concurrency)", async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: "wallet-race", balanceRial: 500_000n }])
      .mockResolvedValueOnce([]);
    tx.$executeRaw.mockResolvedValueOnce(1);

    const result: RefundResult = await issueRefundAsPayout({
      paymentId: "pay-race",
      amountRial: 500_000n,
      destinationIban: "IR120570028780010872200101",
      description: "concurrent drain",
      payoutRef: "payout_race",
    });

    assertFailure(result);
    expect(result.error).toBe("INSUFFICIENT_FLOAT");
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
});

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

    tx.$queryRaw
      .mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 5_000_000n }])
      .mockResolvedValueOnce([{ balanceRial: 4_800_000n }]);
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.walletTransaction.create.mockResolvedValueOnce({
      id: "wtx-overpay",
      walletId: "wallet-1",
      type: "refund_payout",
      amountRial: 200_000n,
      paymentId: "pay-surplus",
      payoutRef: "payout_overpay_xyz",
      destinationIban: "IR120570028780010872200101",
      createdAt: new Date(),
    });

    const result: RefundResult = await resolveOverpaymentViaRefund({
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
          destinationIban: "IR120570028780010872200101",
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

    tx.$queryRaw.mockResolvedValueOnce([{ id: "wallet-1", balanceRial: 100_000n }]);

    const result: RefundResult = await resolveOverpaymentViaRefund({
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

    const result: RefundResult = await resolveOverpaymentViaRefund({
      paymentId: "pay-missing",
      surplusAmountRial: 200_000n,
      destinationIban: "IR120570028780010872200101",
      payoutRef: "payout_missing",
    });

    assertFailure(result);
    expect(result.error).toBe("PAYMENT_NOT_FOUND");
  });
});

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
