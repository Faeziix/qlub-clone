/**
 * Tests for issue #42 — Pay screen: split/tip UX + /pay reachability +
 * gateway-redirect scaffold.
 *
 * Verifies:
 * 1. SimulatedPaymentAdapter singleton persists sessions across factory calls.
 * 2. redirectUrl() derives a local dev URL from the session's callbackUrl origin.
 * 3. The full dev sandbox loop: request → local-dev redirect → simulatePaid →
 *    verify → succeeded, without touching any external service.
 * 4. Factory reset helper clears the singleton.
 * 5. getCallbackUrl() returns the stored callback URL for the dev endpoint to
 *    redirect the browser after marking the session.
 * 6. getSessionSummary() returns safe display info without exposing PII.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SimulatedPaymentAdapter } from "@/lib/payment/adapters/simulated";
import { getPaymentProvider, resetPaymentProviderForTesting } from "@/lib/payment/factory";

function makeInput(overrides: Partial<Parameters<SimulatedPaymentAdapter["request"]>[0]> = {}) {
  return {
    merchantId: "vendor-test",
    amount: 800_000n,
    callbackUrl: "https://qlub.test/api/payments/callback?paymentId=pay_xyz",
    orderId: "order-001",
    ...overrides,
  };
}

describe("Factory singleton — sessions persist across calls", () => {
  beforeEach(() => resetPaymentProviderForTesting());
  afterEach(() => resetPaymentProviderForTesting());

  it("two getPaymentProvider() calls return the same SimulatedPaymentAdapter instance", () => {
    const a = getPaymentProvider();
    const b = getPaymentProvider();
    expect(a).toBe(b);
  });

  it("a session created via the first call is visible through the second call", async () => {
    const first = getPaymentProvider() as SimulatedPaymentAdapter;
    const { ref } = await first.request(makeInput());
    const second = getPaymentProvider() as SimulatedPaymentAdapter;
    expect(second.getSessionForTest(ref)).toBeDefined();
  });

  it("resetPaymentProviderForTesting() clears the singleton so a new instance is created", () => {
    const before = getPaymentProvider();
    resetPaymentProviderForTesting();
    const after = getPaymentProvider();
    expect(before).not.toBe(after);
  });
});

describe("redirectUrl() — local dev URL derived from callbackUrl origin", () => {
  it("returns a URL containing /dev/payment-sim/ and the ref when callbackUrl has a known origin", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(
      makeInput({ callbackUrl: "https://localhost:3000/api/payments/callback?paymentId=p1" })
    );
    const url = adapter.redirectUrl(ref);
    expect(url).toContain("/dev/payment-sim/");
    expect(url).toContain(ref);
    expect(url).toContain("localhost:3000");
  });

  it("falls back to the external sandbox URL when no session is found", () => {
    const adapter = new SimulatedPaymentAdapter();
    const url = adapter.redirectUrl("ghost-ref");
    expect(url).toContain("sandbox.shaparak.test");
  });

  it("does not include payment status or amount in the redirect URL", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeInput());
    adapter.simulatePaid(ref);
    const url = adapter.redirectUrl(ref);
    expect(url).not.toContain("status=");
    expect(url).not.toContain("amount=");
    expect(url).not.toContain("refNumber=");
  });
});

describe("getCallbackUrl() — dev endpoint redirect target", () => {
  it("returns the callbackUrl stored on the session", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const cb = "https://qlub.test/api/payments/callback?paymentId=pay_abc";
    const { ref } = await adapter.request(makeInput({ callbackUrl: cb }));
    expect(adapter.getCallbackUrl(ref)).toBe(cb);
  });

  it("returns undefined for an unknown ref", () => {
    const adapter = new SimulatedPaymentAdapter();
    expect(adapter.getCallbackUrl("no-such-ref")).toBeUndefined();
  });
});

describe("getSessionSummary() — safe display info for dev gateway UI", () => {
  it("returns amount, orderId, and status without exposing callbackUrl or ref", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeInput({ amount: 1_200_000n, orderId: "order-xyz" }));
    const summary = adapter.getSessionSummary(ref);
    expect(summary).not.toBeNull();
    expect(summary!.amount).toBe(1_200_000n);
    expect(summary!.orderId).toBe("order-xyz");
    expect(summary!.status).toBe("pending");
    expect("callbackUrl" in summary!).toBe(false);
    expect("ref" in summary!).toBe(false);
  });

  it("returns undefined for an unknown ref", () => {
    const adapter = new SimulatedPaymentAdapter();
    expect(adapter.getSessionSummary("ghost")).toBeUndefined();
  });

  it("reflects updated status after simulatePaid()", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeInput());
    adapter.simulatePaid(ref);
    expect(adapter.getSessionSummary(ref)!.status).toBe("succeeded");
  });
});

describe("Full dev sandbox loop: request → local-redirect → simulatePaid → verify", () => {
  beforeEach(() => resetPaymentProviderForTesting());
  afterEach(() => resetPaymentProviderForTesting());

  it("completes end-to-end using the singleton so verify() finds the session created by request()", async () => {
    const provider = getPaymentProvider() as SimulatedPaymentAdapter;
    const amount = 600_000n;

    const { ref } = await provider.request(makeInput({ amount }));

    const redirectUrl = provider.redirectUrl(ref);
    expect(redirectUrl).toContain("/dev/payment-sim/");

    provider.simulatePaid(ref);

    const verifyResult = await provider.verify(ref);
    expect(verifyResult.status).toBe("succeeded");
    expect(verifyResult.amount).toBe(amount);
    expect(verifyResult.refNumber).toBeTruthy();
  });

  it("handles cancellation: simulateCancelled → verify returns failed", async () => {
    const provider = getPaymentProvider() as SimulatedPaymentAdapter;
    const { ref } = await provider.request(makeInput());
    provider.simulateCancelled(ref);
    const result = await provider.verify(ref);
    expect(result.status).toBe("failed");
  });
});
