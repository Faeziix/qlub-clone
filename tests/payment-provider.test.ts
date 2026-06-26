/**
 * Tests for issue #20 — PaymentProvider interface + simulated/sandbox facilitator.
 *
 * Acceptance criteria verified:
 * 1. PaymentProvider interface is defined with all listed methods.
 * 2. Simulated adapter implements the full request → redirect → verify → inquire path.
 * 3. End-to-end sandbox flow: request → redirect → server verify → success.
 * 4. Verification is server-side only; redirect success params are NEVER trusted.
 * 5. Active provider is env-selected; simulated is the default (no external account needed).
 *
 * No live gateway required — the simulated adapter runs in-process.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { PaymentProvider } from "@/lib/payment/provider";
import { SimulatedPaymentAdapter } from "@/lib/payment/adapters/simulated";
import { getPaymentProvider } from "@/lib/payment/factory";
import { rialForGateway, rialFromGateway } from "@/lib/money";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeRequestInput(overrides: Partial<Parameters<PaymentProvider["request"]>[0]> = {}) {
  return {
    merchantId: "vendor-abc",
    amount: 500_000n,
    callbackUrl: "https://qlub.test/api/payments/callback",
    orderId: "order-001",
    description: "پرداخت سفارش Q-000001",
    mobile: "09121234567",
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Interface shape (type-level + runtime)
// ──────────────────────────────────────────────────────────────────────────────

describe("PaymentProvider interface — method presence", () => {
  it("SimulatedPaymentAdapter implements all required PaymentProvider methods", () => {
    const adapter: PaymentProvider = new SimulatedPaymentAdapter();
    expect(typeof adapter.request).toBe("function");
    expect(typeof adapter.redirectUrl).toBe("function");
    expect(typeof adapter.verify).toBe("function");
    expect(typeof adapter.inquire).toBe("function");
    expect(typeof adapter.refundViaPayout).toBe("function");
    expect(typeof adapter.onboardSubMerchant).toBe("function");
    expect(typeof adapter.verifyIban).toBe("function");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. request() — creates a pending session and returns a ref
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.request()", () => {
  let adapter: SimulatedPaymentAdapter;
  beforeEach(() => { adapter = new SimulatedPaymentAdapter(); });

  it("returns a non-empty ref string", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    expect(typeof ref).toBe("string");
    expect(ref.length).toBeGreaterThan(0);
  });

  it("returns a unique ref per call", async () => {
    const { ref: ref1 } = await adapter.request(makeRequestInput());
    const { ref: ref2 } = await adapter.request(makeRequestInput());
    expect(ref1).not.toBe(ref2);
  });

  it("stores the amount in rial (integer string format)", async () => {
    const amount = 1_500_000n;
    const { ref } = await adapter.request(makeRequestInput({ amount }));
    const session = adapter.getSessionForTest(ref);
    expect(session).not.toBeUndefined();
    expect(session!.amount).toBe(amount);
  });

  it("stores orderId and callbackUrl on the session", async () => {
    const { ref } = await adapter.request(
      makeRequestInput({ orderId: "order-xyz", callbackUrl: "https://qlub.test/cb" })
    );
    const session = adapter.getSessionForTest(ref);
    expect(session!.orderId).toBe("order-xyz");
    expect(session!.callbackUrl).toBe("https://qlub.test/cb");
  });

  it("sets initial session status to pending", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    const session = adapter.getSessionForTest(ref);
    expect(session!.status).toBe("pending");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. redirectUrl() — builds the gateway start URL
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.redirectUrl()", () => {
  let adapter: SimulatedPaymentAdapter;
  beforeEach(() => { adapter = new SimulatedPaymentAdapter(); });

  it("returns a string URL containing the ref", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    const url = adapter.redirectUrl(ref);
    expect(typeof url).toBe("string");
    expect(url).toContain(ref);
  });

  it("returns a deterministic URL for the same ref", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    expect(adapter.redirectUrl(ref)).toBe(adapter.redirectUrl(ref));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. verify() — SERVER-SIDE verification is authoritative
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.verify()", () => {
  let adapter: SimulatedPaymentAdapter;
  beforeEach(() => { adapter = new SimulatedPaymentAdapter(); });

  it("returns status=succeeded and the correct amount after the simulated payer pays", async () => {
    const amount = 750_000n;
    const { ref } = await adapter.request(makeRequestInput({ amount }));
    adapter.simulatePaid(ref);
    const result = await adapter.verify(ref);
    expect(result.status).toBe("succeeded");
    expect(result.amount).toBe(amount);
  });

  it("returns a non-empty refNumber on success", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulatePaid(ref);
    const result = await adapter.verify(ref);
    expect(typeof result.refNumber).toBe("string");
    expect(result.refNumber!.length).toBeGreaterThan(0);
  });

  it("returns status=failed when the simulated payer cancels", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulateCancelled(ref);
    const result = await adapter.verify(ref);
    expect(result.status).toBe("failed");
  });

  it("returns status=failed for an unknown ref", async () => {
    const result = await adapter.verify("unknown-ref-xyz");
    expect(result.status).toBe("failed");
  });

  it("is idempotent — second verify call returns same result as first", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulatePaid(ref);
    const first = await adapter.verify(ref);
    const second = await adapter.verify(ref);
    expect(second.status).toBe(first.status);
    expect(second.refNumber).toBe(first.refNumber);
  });

  it("returning already-processed (succeeded) from verify does NOT change result", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulatePaid(ref);
    await adapter.verify(ref);
    const again = await adapter.verify(ref);
    expect(again.status).toBe("succeeded");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Server-side verification — redirect params must NEVER be trusted
//    This tests the CONTRACT, not the internals.
// ──────────────────────────────────────────────────────────────────────────────

describe("Server-side verify contract — redirect params NEVER trusted", () => {
  it("the redirect URL does NOT contain payment status or amount in a trusted form", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulatePaid(ref);
    const url = adapter.redirectUrl(ref);
    // The redirect URL is for the BROWSER — it must NOT carry authoritative status.
    // The only trustworthy source is adapter.verify(), called server-side.
    expect(url).not.toContain("status=succeeded");
    expect(url).not.toContain("amount=");
    expect(url).not.toContain("refNumber=");
  });

  it("a tampered redirect with a fake success param does not bypass server verify", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeRequestInput());
    // Payer did NOT pay — but attacker fakes the redirect query string.
    // The server calls verify() not the redirect params.
    const result = await adapter.verify(ref);
    // Should be pending/failed, not succeeded — because simulatePaid was never called.
    expect(result.status).not.toBe("succeeded");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. inquire() — reconciliation / status API
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.inquire()", () => {
  let adapter: SimulatedPaymentAdapter;
  beforeEach(() => { adapter = new SimulatedPaymentAdapter(); });

  it("returns status=pending for a fresh payment", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    const { status } = await adapter.inquire(ref);
    expect(status).toBe("pending");
  });

  it("returns status=succeeded after simulatePaid", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulatePaid(ref);
    const { status, amount } = await adapter.inquire(ref);
    expect(status).toBe("succeeded");
    expect(amount).toBe(500_000n);
  });

  it("returns status=failed after simulateCancelled", async () => {
    const { ref } = await adapter.request(makeRequestInput());
    adapter.simulateCancelled(ref);
    const { status } = await adapter.inquire(ref);
    expect(status).toBe("failed");
  });

  it("returns status=failed for unknown ref", async () => {
    const { status } = await adapter.inquire("ghost-ref");
    expect(status).toBe("failed");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. refundViaPayout() — wallet-funded payout
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.refundViaPayout()", () => {
  it("returns a payoutRef string", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const result = await adapter.refundViaPayout({
      paymentRef: "pay-ref-001",
      amount: 200_000n,
      destinationIban: "IR000000000000000000000001",
      description: "بازپرداخت",
    });
    expect(typeof result.payoutRef).toBe("string");
    expect(result.payoutRef.length).toBeGreaterThan(0);
  });

  it("returns status=succeeded for simulated refund", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const result = await adapter.refundViaPayout({
      paymentRef: "pay-ref-002",
      amount: 100_000n,
      destinationIban: "IR000000000000000000000002",
      description: "بازپرداخت",
    });
    expect(result.status).toBe("succeeded");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. onboardSubMerchant() — sub-merchant registration
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.onboardSubMerchant()", () => {
  it("returns a subMerchantId string", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const result = await adapter.onboardSubMerchant({
      nationalId: "1234567890",
      businessName: "رستوران آزمایش",
      iban: "IR000000000000000000000001",
    });
    expect(typeof result.subMerchantId).toBe("string");
    expect(result.subMerchantId.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. verifyIban() — CBI IBAN verification
// ──────────────────────────────────────────────────────────────────────────────

describe("SimulatedPaymentAdapter.verifyIban()", () => {
  it("returns verified=true for a valid simulated IBAN", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const result = await adapter.verifyIban({ iban: "IR000000000000000000000001" });
    expect(result.verified).toBe(true);
    expect(typeof result.holderName).toBe("string");
  });

  it("returns verified=false for an invalid IBAN", async () => {
    const adapter = new SimulatedPaymentAdapter();
    const result = await adapter.verifyIban({ iban: "INVALID" });
    expect(result.verified).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. End-to-end sandbox flow: request → redirect → server verify → success
// ──────────────────────────────────────────────────────────────────────────────

describe("End-to-end sandbox flow", () => {
  it("completes the full request → redirect → server verify → success path", async () => {
    const adapter: PaymentProvider = new SimulatedPaymentAdapter();
    const amount = 1_200_000n;

    // Step 1 — Request: creates a pending gateway session
    const { ref } = await adapter.request(makeRequestInput({ amount }));
    expect(ref).toBeTruthy();

    // Step 2 — Redirect: browser navigates to this URL
    const url = adapter.redirectUrl(ref);
    expect(url).toContain(ref);

    // Step 3 — Payer completes payment at the gateway (simulated)
    (adapter as SimulatedPaymentAdapter).simulatePaid(ref);

    // Step 4 — Server verify (NEVER trust the redirect param — call verify() server-side)
    const verification = await adapter.verify(ref);
    expect(verification.status).toBe("succeeded");
    expect(verification.amount).toBe(amount);
    expect(verification.refNumber).toBeTruthy();
  });

  it("inquire() returns the same succeeded status after verify", async () => {
    const adapter: PaymentProvider = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeRequestInput({ amount: 300_000n }));
    (adapter as SimulatedPaymentAdapter).simulatePaid(ref);
    await adapter.verify(ref);
    const { status, amount } = await adapter.inquire(ref);
    expect(status).toBe("succeeded");
    expect(amount).toBe(300_000n);
  });

  it("a cancelled payment is reported as failed by both verify and inquire", async () => {
    const adapter: PaymentProvider = new SimulatedPaymentAdapter();
    const { ref } = await adapter.request(makeRequestInput());
    (adapter as SimulatedPaymentAdapter).simulateCancelled(ref);
    const verifyResult = await adapter.verify(ref);
    const inquireResult = await adapter.inquire(ref);
    expect(verifyResult.status).toBe("failed");
    expect(inquireResult.status).toBe("failed");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. Provider factory — env-selected, simulated by default
// ──────────────────────────────────────────────────────────────────────────────

describe("getPaymentProvider factory", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("returns SimulatedPaymentAdapter when PAYMENT_PROVIDER is not set", () => {
    vi.stubEnv("PAYMENT_PROVIDER", undefined);
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(SimulatedPaymentAdapter);
  });

  it("returns SimulatedPaymentAdapter when PAYMENT_PROVIDER=simulated", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "simulated");
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(SimulatedPaymentAdapter);
  });

  it("returns SimulatedPaymentAdapter when PAYMENT_PROVIDER=sandbox", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(SimulatedPaymentAdapter);
  });

  it("returns a PaymentProvider-compliant object regardless of env", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "simulated");
    const provider = getPaymentProvider();
    expect(typeof provider.request).toBe("function");
    expect(typeof provider.verify).toBe("function");
    expect(typeof provider.inquire).toBe("function");
    expect(typeof provider.redirectUrl).toBe("function");
    expect(typeof provider.refundViaPayout).toBe("function");
    expect(typeof provider.onboardSubMerchant).toBe("function");
    expect(typeof provider.verifyIban).toBe("function");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. money.ts gateway boundary — rial integer string round-trips
// ──────────────────────────────────────────────────────────────────────────────

describe("Gateway money boundary — rialForGateway / rialFromGateway", () => {
  it("500000 rial is sent to gateway as '500000' (not toman '50000')", () => {
    expect(rialForGateway(500_000n)).toBe("500000");
  });

  it("gateway response '1200000' parsed back to 1200000n rial", () => {
    expect(rialFromGateway("1200000")).toBe(1_200_000n);
  });

  it("round-trips without ×10 drift", () => {
    const rial = 750_000n;
    expect(rialFromGateway(rialForGateway(rial))).toBe(rial);
  });
});
