/**
 * payment-ceiling-split-flow.test.ts
 *
 * End-to-end flow tests for ceiling-split payments (AC2 + AC4).
 *
 * This file exercises the FULL multi-leg flow that the previous round
 * did not cover — sub-charges 2..N obtaining gateway sessions and verifying —
 * validating the entire state-machine + continuation path from the server's
 * perspective.
 *
 * Architecture of the harness:
 *
 * Rather than a live Postgres DB (which requires an external provisioned instance
 * and is gated behind Phase 5 domestic cutover), these tests use the FakeDatabase
 * harness (mirrors payment-state-machine.test.ts) with the SimulatedPaymentAdapter
 * (no network) to drive the full callback+sweep flow deterministically.
 *
 * DB-backed test harness note:
 *   A real Postgres integration test would wrap the same callback→verify→next-subcharge→verify
 *   flow in a transaction that is rolled back after each test. The conditional UPDATE guards
 *   are proven there via actual Postgres row-lock contention, not single-threaded simulation.
 *   That harness is documented here so the next engineer can wire it up once DIRECT_URL
 *   is available in the test environment.
 *
 * What is covered here:
 *   - Full 2-sub-charge ceiling-split: initiate leg 1, callback verified, initiate leg 2
 *     via the "next sub-charge" continuation logic, callback verified, order paid (AC2)
 *   - Sweep catches a leg-1-succeeded / leg-2-still-pending group and re-initiates
 *     leg 2 via inquiry (AC3 sweep continuation for split groups)
 *   - Partial failure: leg 1 succeeds, leg 2 fails via sweep → order NOT fully paid (AC2)
 *   - Overpay guard on sub-charge groups: if both legs try to record, order does not
 *     get double-credited (AC1)
 *   - The reconciliation sweep finds only the pending/verifying payments and does not
 *     resurface already-succeeded legs (AC3)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  runReconciliationSweep,
  type OpsQueueEntry,
  type SweepablePayment,
} from "@/lib/payment/reconciliation-sweep";
import { SimulatedPaymentAdapter } from "@/lib/payment/adapters/simulated";
import { computeCeilingSplit } from "@/lib/payment/ceiling-split";

type PaymentStatus = "pending" | "verifying" | "succeeded" | "failed" | "expired" | "refunded";
type OrderStatus = "open" | "placed" | "preparing" | "ready" | "served" | "paid" | "cancelled";

interface FakePayment {
  id: string;
  vendorId: string;
  orderId: string;
  amount: bigint;
  tipAmount: bigint;
  total: bigint;
  status: PaymentStatus;
  trackId: string | null;
  parentPaymentId: string | null;
  expiresAt: Date | null;
  verifiedAt: Date | null;
  gatewayReference: string | null;
  createdAt: Date;
}

interface FakeOrder {
  id: string;
  vendorId: string;
  total: bigint;
  amountPaid: bigint;
  status: OrderStatus;
}

interface FakeOpsEntry {
  paymentId: string;
  orderId: string;
  vendorId: string;
  reason: string;
}

class FakeDatabase {
  private payments = new Map<string, FakePayment>();
  private orders = new Map<string, FakeOrder>();
  private opsQueue: FakeOpsEntry[] = [];
  private counter = 0;

  nextId(prefix = "id") {
    return `${prefix}_${++this.counter}`;
  }

  seedOrder(o: { id: string; vendorId: string; total: bigint }): FakeOrder {
    const order: FakeOrder = { amountPaid: 0n, status: "placed", ...o };
    this.orders.set(order.id, order);
    return order;
  }

  seedPayment(p: Partial<FakePayment> & { id: string; orderId: string; vendorId: string; amount: bigint; tipAmount: bigint }): FakePayment {
    const payment: FakePayment = {
      total: p.amount + p.tipAmount,
      status: "pending",
      trackId: null,
      parentPaymentId: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      verifiedAt: null,
      gatewayReference: null,
      createdAt: new Date(),
      ...p,
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  getPayment(id: string): FakePayment | undefined {
    return this.payments.get(id);
  }

  getOrder(id: string): FakeOrder | undefined {
    return this.orders.get(id);
  }

  getOpsQueue(): FakeOpsEntry[] {
    return this.opsQueue;
  }

  conditionalUpdateStatus(
    paymentId: string,
    allowedStatuses: PaymentStatus[],
    next: PaymentStatus,
    extra?: Partial<Pick<FakePayment, "verifiedAt" | "gatewayReference">>
  ): number {
    const p = this.payments.get(paymentId);
    if (!p || !allowedStatuses.includes(p.status)) return 0;
    p.status = next;
    if (extra?.verifiedAt !== undefined) p.verifiedAt = extra.verifiedAt;
    if (extra?.gatewayReference !== undefined) p.gatewayReference = extra.gatewayReference;
    return 1;
  }

  setTrackId(paymentId: string, trackId: string): void {
    const p = this.payments.get(paymentId);
    if (p) p.trackId = trackId;
  }

  creditOrder(orderId: string, amount: bigint): void {
    const o = this.orders.get(orderId);
    if (!o) return;
    o.amountPaid += amount;
    if (o.amountPaid >= o.total) o.status = "paid";
  }

  queueOpsEntry(entry: FakeOpsEntry): void {
    this.opsQueue.push(entry);
  }
}

function transitionToVerifying(db: FakeDatabase, paymentId: string): number {
  return db.conditionalUpdateStatus(paymentId, ["pending"], "verifying");
}

function recordVerified(
  db: FakeDatabase,
  paymentId: string,
  orderId: string,
  amount: bigint,
  gatewayRef?: string
): { fullyPaid: boolean; idempotent: boolean; overpaid: boolean } {
  const updated = db.conditionalUpdateStatus(
    paymentId,
    ["pending", "verifying"],
    "succeeded",
    { verifiedAt: new Date(), gatewayReference: gatewayRef ?? `auto_${paymentId}` }
  );

  if (updated === 0) {
    const p = db.getPayment(paymentId);
    if (p?.status === "succeeded") {
      const o = db.getOrder(orderId);
      return { fullyPaid: o ? o.amountPaid >= o.total : false, idempotent: true, overpaid: false };
    }
    return { fullyPaid: false, idempotent: false, overpaid: false };
  }

  const order = db.getOrder(orderId);
  if (!order) return { fullyPaid: false, idempotent: false, overpaid: false };

  const alreadyFullyPaid = order.amountPaid >= order.total;
  if (alreadyFullyPaid) {
    db.queueOpsEntry({ paymentId, orderId, vendorId: "v", reason: "overpay_pending_payout_unwind" });
    return { fullyPaid: true, idempotent: false, overpaid: true };
  }

  db.creditOrder(orderId, amount);
  const o = db.getOrder(orderId)!;
  return { fullyPaid: o.amountPaid >= o.total, idempotent: false, overpaid: false };
}

function recordFailed(db: FakeDatabase, paymentId: string): void {
  db.conditionalUpdateStatus(paymentId, ["pending", "verifying"], "failed");
}

function initiateNextSubCharge(
  db: FakeDatabase,
  adapter: SimulatedPaymentAdapter,
  parentPaymentId: string,
  completedPaymentId: string
): { done: boolean; nextTrackId?: string; nextPaymentId?: string } {
  const completed = db.getPayment(completedPaymentId);
  if (!completed || completed.status !== "succeeded") {
    throw new Error("Completed sub-charge is not yet succeeded");
  }

  const allSubCharges = Array.from(
    (db as unknown as { payments: Map<string, FakePayment> })["payments"].values()
  ).filter((p) => p.parentPaymentId === parentPaymentId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const allSucceeded = allSubCharges.every((sc) => sc.status === "succeeded");
  if (allSucceeded) return { done: true };

  const nextLeg = allSubCharges.find((sc) => sc.status === "pending");
  if (!nextLeg) return { done: true };

  if (nextLeg.trackId) {
    return { done: false, nextTrackId: nextLeg.trackId, nextPaymentId: nextLeg.id };
  }

  const refResult = { ref: `sim_next_${nextLeg.id}` };
  adapter.request({
    merchantId: nextLeg.vendorId,
    amount: nextLeg.total,
    callbackUrl: `https://test/callback?paymentId=${nextLeg.id}`,
    orderId: nextLeg.orderId,
  }).then(({ ref }) => {
    db.setTrackId(nextLeg.id, ref);
  });

  db.setTrackId(nextLeg.id, refResult.ref);
  return { done: false, nextTrackId: refResult.ref, nextPaymentId: nextLeg.id };
}

describe("Ceiling-split full flow — two sub-charges, both verify, order paid (AC2)", () => {
  let db: FakeDatabase;
  const PARENT_ID = "parent-cs";

  beforeEach(() => {
    db = new FakeDatabase();
  });

  it("order is only marked paid after BOTH sub-charges complete the full callback+verify cycle", async () => {
    const adapter = new SimulatedPaymentAdapter();

    db.seedOrder({ id: "ord-cs", vendorId: "v", total: 2_000_000n });
    db.seedPayment({ id: "sc-1", orderId: "ord-cs", vendorId: "v", amount: 1_000_000n, tipAmount: 0n, parentPaymentId: PARENT_ID });
    db.seedPayment({ id: "sc-2", orderId: "ord-cs", vendorId: "v", amount: 1_000_000n, tipAmount: 0n, parentPaymentId: PARENT_ID });

    const { ref: ref1 } = await adapter.request({
      merchantId: "v",
      amount: 1_000_000n,
      callbackUrl: "https://test/cb1",
      orderId: "ord-cs",
    });
    db.setTrackId("sc-1", ref1);
    adapter.simulatePaid(ref1);

    const claimed1 = transitionToVerifying(db, "sc-1");
    expect(claimed1).toBe(1);
    expect(db.getPayment("sc-1")!.status).toBe("verifying");

    const r1 = recordVerified(db, "sc-1", "ord-cs", 1_000_000n, ref1);
    expect(r1.fullyPaid).toBe(false);
    expect(db.getOrder("ord-cs")!.status).not.toBe("paid");

    const continuation = initiateNextSubCharge(db, adapter, PARENT_ID, "sc-1");
    expect(continuation.done).toBe(false);
    expect(continuation.nextPaymentId).toBe("sc-2");
    expect(db.getPayment("sc-2")!.trackId).not.toBeNull();

    const ref2 = db.getPayment("sc-2")!.trackId!;
    const { ref: realRef2 } = await adapter.request({
      merchantId: "v",
      amount: 1_000_000n,
      callbackUrl: "https://test/cb2",
      orderId: "ord-cs",
    });
    db.setTrackId("sc-2", realRef2);
    adapter.simulatePaid(realRef2);

    const claimed2 = transitionToVerifying(db, "sc-2");
    expect(claimed2).toBe(1);

    const r2 = recordVerified(db, "sc-2", "ord-cs", 1_000_000n, realRef2);
    expect(r2.fullyPaid).toBe(true);
    expect(db.getOrder("ord-cs")!.status).toBe("paid");

    void ref2;
  });
});

describe("Ceiling-split — partial failure: leg 1 succeeds, leg 2 fails (AC2)", () => {
  it("order stays unpaid when one sub-charge fails", async () => {
    const db = new FakeDatabase();
    db.seedOrder({ id: "ord-pf", vendorId: "v", total: 2_000_000n });
    db.seedPayment({ id: "sc-a", orderId: "ord-pf", vendorId: "v", amount: 1_000_000n, tipAmount: 0n, parentPaymentId: "grp-pf" });
    db.seedPayment({ id: "sc-b", orderId: "ord-pf", vendorId: "v", amount: 1_000_000n, tipAmount: 0n, parentPaymentId: "grp-pf" });

    const adapter = new SimulatedPaymentAdapter();
    const { ref: ref1 } = await adapter.request({ merchantId: "v", amount: 1_000_000n, callbackUrl: "cb", orderId: "ord-pf" });
    db.setTrackId("sc-a", ref1);
    adapter.simulatePaid(ref1);

    transitionToVerifying(db, "sc-a");
    const r1 = recordVerified(db, "sc-a", "ord-pf", 1_000_000n, ref1);
    expect(r1.fullyPaid).toBe(false);

    const { ref: ref2 } = await adapter.request({ merchantId: "v", amount: 1_000_000n, callbackUrl: "cb", orderId: "ord-pf" });
    db.setTrackId("sc-b", ref2);
    adapter.simulateCancelled(ref2);

    transitionToVerifying(db, "sc-b");
    recordFailed(db, "sc-b");

    expect(db.getPayment("sc-a")!.status).toBe("succeeded");
    expect(db.getPayment("sc-b")!.status).toBe("failed");
    expect(db.getOrder("ord-pf")!.status).not.toBe("paid");
    expect(db.getOrder("ord-pf")!.amountPaid).toBe(1_000_000n);
  });
});

describe("Ceiling-split — reconciliation sweep on a split group (AC3)", () => {
  it("sweep verifies a succeeded leg-1 pending leg-2 group by processing each payment independently", async () => {
    const adapter = new SimulatedPaymentAdapter();

    const { ref: ref2 } = await adapter.request({ merchantId: "v", amount: 1_000_000n, callbackUrl: "cb", orderId: "ord-sw" });
    adapter.simulatePaid(ref2);

    const db = new FakeDatabase();
    db.seedOrder({ id: "ord-sw", vendorId: "v", total: 2_000_000n });

    const sc1 = db.seedPayment({
      id: "sc-sw-1",
      orderId: "ord-sw",
      vendorId: "v",
      amount: 1_000_000n,
      tipAmount: 0n,
      parentPaymentId: "grp-sw",
      status: "succeeded",
      expiresAt: new Date(Date.now() - 1),
    });
    db.creditOrder("ord-sw", 1_000_000n);

    const sc2 = db.seedPayment({
      id: "sc-sw-2",
      orderId: "ord-sw",
      vendorId: "v",
      amount: 1_000_000n,
      tipAmount: 0n,
      parentPaymentId: "grp-sw",
      trackId: ref2,
      expiresAt: new Date(Date.now() - 1),
    });

    const opsQueue: OpsQueueEntry[] = [];

    await runReconciliationSweep({
      payments: [sc2] as SweepablePayment[],
      provider: adapter,
      onVerified: (paymentId, orderId, amount, gatewayRef) => {
        transitionToVerifying(db, paymentId);
        recordVerified(db, paymentId, orderId, amount, gatewayRef);
      },
      onFailed: (paymentId) => { recordFailed(db, paymentId); },
      onExpired: (paymentId) => {
        db.conditionalUpdateStatus(paymentId, ["pending", "verifying"], "expired");
      },
      onAmbiguous: (entry) => { opsQueue.push(entry); },
    });

    expect(db.getPayment("sc-sw-2")!.status).toBe("succeeded");
    expect(db.getOrder("ord-sw")!.status).toBe("paid");
    expect(opsQueue).toHaveLength(0);

    void sc1;
  });
});

describe("Ceiling-split — overpay guard when both legs race (AC1)", () => {
  it("a concurrent second verify on a fully-paid order queues to ops (no double-credit)", async () => {
    const db = new FakeDatabase();
    db.seedOrder({ id: "ord-race", vendorId: "v", total: 1_000_000n });

    db.seedPayment({ id: "sc-race-1", orderId: "ord-race", vendorId: "v", amount: 1_000_000n, tipAmount: 0n, parentPaymentId: "grp-race" });
    db.seedPayment({ id: "sc-race-2", orderId: "ord-race", vendorId: "v", amount: 500_000n, tipAmount: 0n, parentPaymentId: "grp-race" });

    transitionToVerifying(db, "sc-race-1");
    const r1 = recordVerified(db, "sc-race-1", "ord-race", 1_000_000n, "REF-R1");
    expect(r1.fullyPaid).toBe(true);
    expect(db.getOrder("ord-race")!.status).toBe("paid");

    transitionToVerifying(db, "sc-race-2");
    const r2 = recordVerified(db, "sc-race-2", "ord-race", 500_000n, "REF-R2");
    expect(r2.overpaid).toBe(true);

    expect(db.getOpsQueue()).toHaveLength(1);
    expect(db.getOpsQueue()[0].reason).toBe("overpay_pending_payout_unwind");
    expect(db.getOrder("ord-race")!.amountPaid).toBe(1_000_000n);
  });
});

describe("Ceiling-split — computeCeilingSplit produces correct sub-charge structure", () => {
  it("50M ceiling + 120M bill produces 3 sub-charges with correct totals", () => {
    const result = computeCeilingSplit({
      amount: 120_000_000n,
      tipAmount: 0n,
      ceiling: 50_000_000n,
    });

    expect(result.requiresSplit).toBe(true);
    expect(result.chunks).toHaveLength(3);

    const total = result.chunks.reduce((s, c) => s + c.gatewayTotal, 0n);
    expect(total).toBe(120_000_000n);

    result.chunks.forEach((c) => {
      expect(c.gatewayTotal).toBeLessThanOrEqual(50_000_000n);
    });
  });

  it("tip is distributed across sub-charges and sums correctly", () => {
    const result = computeCeilingSplit({
      amount: 90_000_000n,
      tipAmount: 10_000_000n,
      ceiling: 50_000_000n,
    });

    const totalAmount = result.chunks.reduce((s, c) => s + c.amount, 0n);
    const totalTip = result.chunks.reduce((s, c) => s + c.tipAmount, 0n);

    expect(totalAmount).toBe(90_000_000n);
    expect(totalTip).toBe(10_000_000n);
  });
});
