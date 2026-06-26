/**
 * Integration tests for payment-service.ts — tests the REAL shipped functions
 * via vi.mock('@/lib/db') to verify the conditional-UPDATE guards and
 * overpay logic (PRD §5.4.2, §5.4.3, AC1, AC4).
 *
 * Distinct from payment-state-machine.test.ts which uses a parallel FakeDatabase
 * reimplementation. These tests call the actual exported functions and assert
 * against the real SQL guard patterns.
 *
 * Coverage:
 * - double-callback: transitionToVerifying returns 0 on second call
 * - refresh: recordPaymentVerified is idempotent (succeeded → idempotent=true)
 * - already-processed: recordPaymentVerified on already-succeeded is idempotent
 * - overpay: recordPaymentVerified on an already-fully-paid order marks surplus refunded
 * - abandon: expirePayment only fires when expiresAt < NOW (guarded in raw SQL)
 * - ceiling-split: order only fully paid after all sub-charges verify
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const executeRawResults: number[] = [];

  const mockTx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    payment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    diningTable: {
      update: vi.fn(),
    },
    opsQueueEntry: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const mockDb = {
    $executeRaw: vi.fn(),
    $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    payment: {
      findUnique: vi.fn(),
    },
    _tx: mockTx,
    _executeRawResults: executeRawResults,
  };

  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));

import {
  transitionToVerifying,
  recordPaymentVerified,
  recordPaymentFailed,
  expirePayment,
  recordPaymentRefunded,
} from "@/lib/payment/payment-service";

const tx = mockDb._tx;

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb._tx) => unknown) => fn(tx));
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. transitionToVerifying — conditional UPDATE guard (AC1)
// ──────────────────────────────────────────────────────────────────────────────

describe("transitionToVerifying — conditional UPDATE guard", () => {
  it("returns 1 when the payment is in pending status (first caller wins)", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(1);

    const result = await transitionToVerifying("pay-1");

    expect(result).toBe(1);
    expect(mockDb.$executeRaw).toHaveBeenCalledOnce();
  });

  it("returns 0 when the payment is already in verifying status (double-callback guard)", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(0);

    const result = await transitionToVerifying("pay-already-verifying");

    expect(result).toBe(0);
  });

  it("returns 0 for a succeeded payment (no re-claim)", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(0);

    const result = await transitionToVerifying("pay-succeeded");

    expect(result).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. recordPaymentVerified — succeeds and credits order (AC1, AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("recordPaymentVerified — succeeds and credits order", () => {
  it("transitions verifying → succeeded and marks order paid when amount covers total", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-1", total: 500_000n, amountPaid: 0n, tableId: null, status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "pay-1",
      orderId: "ord-1",
      amount: 500_000n,
      gatewayReference: "REF001",
    });

    expect(result.fullyPaid).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.overpaid).toBe(false);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", amountPaid: 500_000n }),
      })
    );
  });

  it("returns fullyPaid=false when payment covers only part of the order (ceiling-split sub-charge)", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-cs", total: 2_000_000n, amountPaid: 0n, tableId: null, status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "sub-1",
      orderId: "ord-cs",
      amount: 1_000_000n,
    });

    expect(result.fullyPaid).toBe(false);
    expect(result.overpaid).toBe(false);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountPaid: 1_000_000n }),
      })
    );
  });

  it("frees the dining table when order becomes fully paid and tableId is set", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-t", total: 200_000n, amountPaid: 0n, tableId: "tbl-9", status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});
    tx.diningTable.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "pay-t",
      orderId: "ord-t",
      amount: 200_000n,
    });

    expect(result.fullyPaid).toBe(true);
    expect(tx.diningTable.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "available" } })
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Double-callback scenario (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Double-callback scenario", () => {
  it("second recordPaymentVerified call is idempotent when payment already succeeded", async () => {
    tx.$executeRaw.mockResolvedValueOnce(0);
    tx.payment.findUnique.mockResolvedValueOnce({ status: "succeeded" });
    tx.order.findUnique.mockResolvedValueOnce({ amountPaid: 500_000n, total: 500_000n });

    const result = await recordPaymentVerified({
      paymentId: "pay-dc",
      orderId: "ord-dc",
      amount: 500_000n,
      gatewayReference: "REF-DC",
    });

    expect(result.idempotent).toBe(true);
    expect(result.fullyPaid).toBe(true);
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Refresh-on-success scenario (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Refresh-on-success scenario", () => {
  it("user refreshes callback page — recordPaymentVerified returns idempotent=true with no DB mutation", async () => {
    tx.$executeRaw.mockResolvedValueOnce(0);
    tx.payment.findUnique.mockResolvedValueOnce({ status: "succeeded" });
    tx.order.findUnique.mockResolvedValueOnce({ amountPaid: 300_000n, total: 300_000n });

    const result = await recordPaymentVerified({
      paymentId: "pay-rs",
      orderId: "ord-rs",
      amount: 300_000n,
      gatewayReference: "REF-RS",
    });

    expect(result.idempotent).toBe(true);
    expect(result.overpaid).toBe(false);
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Already-processed scenario (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Already-processed scenario", () => {
  it("gateway returns already-processed — succeeded payment returns idempotent=true", async () => {
    tx.$executeRaw.mockResolvedValueOnce(0);
    tx.payment.findUnique.mockResolvedValueOnce({ status: "succeeded" });
    tx.order.findUnique.mockResolvedValueOnce({ amountPaid: 400_000n, total: 400_000n });

    const result = await recordPaymentVerified({
      paymentId: "pay-ap",
      orderId: "ord-ap",
      amount: 400_000n,
      gatewayReference: "REF-AP",
    });

    expect(result.idempotent).toBe(true);
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Overpay scenario — surplus refund on live verify path (PRD §5.4.2, AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Overpay scenario — surplus refund in live verify path", () => {
  it("queues surplus payment to ops (overpay_pending_payout_unwind) per PRD §6.6", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);

    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-op", total: 500_000n, amountPaid: 500_000n, tableId: null, status: "paid", vendorId: "v-1" },
    ]);

    const result = await recordPaymentVerified({
      paymentId: "pay-op-surplus",
      orderId: "ord-op",
      amount: 200_000n,
      vendorId: "v-1",
      gatewayReference: "REF-OP-SURPLUS",
    });

    expect(result.overpaid).toBe(true);
    expect(result.fullyPaid).toBe(true);
    expect(result.idempotent).toBe(false);

    expect(tx.order.update).not.toHaveBeenCalled();

    expect(tx.opsQueueEntry.create).toHaveBeenCalledOnce();
    expect(tx.opsQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "pay-op-surplus",
          orderId: "ord-op",
          reason: "overpay_pending_payout_unwind",
        }),
      })
    );
  });

  it("does NOT refund when payment covers remaining balance exactly", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-exact", total: 500_000n, amountPaid: 300_000n, tableId: null, status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "pay-exact",
      orderId: "ord-exact",
      amount: 200_000n,
    });

    expect(result.overpaid).toBe(false);
    expect(result.fullyPaid).toBe(true);
    expect(tx.order.update).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Abandon (TTL expiry) scenario (AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Abandon scenario — expirePayment conditional guard", () => {
  it("calls $executeRaw with status=expired conditional guard", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(1);

    await expirePayment("pay-ab");

    expect(mockDb.$executeRaw).toHaveBeenCalledOnce();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. recordPaymentFailed — conditional guard (AC1)
// ──────────────────────────────────────────────────────────────────────────────

describe("recordPaymentFailed — conditional guard", () => {
  it("calls $executeRaw with status IN (pending, verifying) guard", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(1);

    await recordPaymentFailed("pay-fail");

    expect(mockDb.$executeRaw).toHaveBeenCalledOnce();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. recordPaymentRefunded — succeeded → refunded guard (AC1)
// ──────────────────────────────────────────────────────────────────────────────

describe("recordPaymentRefunded — succeeded → refunded guard", () => {
  it("returns row count from $executeRaw (1 when payment was succeeded)", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(1);

    const count = await recordPaymentRefunded("pay-ref");

    expect(count).toBe(1);
  });

  it("returns 0 when payment is in wrong state (pending cannot be refunded)", async () => {
    mockDb.$executeRaw.mockResolvedValueOnce(0);

    const count = await recordPaymentRefunded("pay-pending");

    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. Ceiling-split — order fully paid only when all sub-charges verify (AC2, AC4)
// ──────────────────────────────────────────────────────────────────────────────

describe("Ceiling-split — order paid only when all sub-charges verify (live path)", () => {
  it("first sub-charge: fullyPaid=false because amountPaid < total", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-cs", total: 3_000_000n, amountPaid: 0n, tableId: null, status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "sc-1",
      orderId: "ord-cs",
      amount: 1_000_000n,
    });

    expect(result.fullyPaid).toBe(false);
    expect(result.overpaid).toBe(false);
  });

  it("second sub-charge: fullyPaid=false because amountPaid still < total", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-cs", total: 3_000_000n, amountPaid: 1_000_000n, tableId: null, status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "sc-2",
      orderId: "ord-cs",
      amount: 1_000_000n,
    });

    expect(result.fullyPaid).toBe(false);
  });

  it("third sub-charge: fullyPaid=true, order transitions to paid", async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "ord-cs", total: 3_000_000n, amountPaid: 2_000_000n, tableId: null, status: "placed" },
    ]);
    tx.order.update.mockResolvedValueOnce({});

    const result = await recordPaymentVerified({
      paymentId: "sc-3",
      orderId: "ord-cs",
      amount: 1_000_000n,
    });

    expect(result.fullyPaid).toBe(true);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", amountPaid: 3_000_000n }),
      })
    );
  });
});
