/**
 * SimulatedPaymentAdapter — a fully in-process sandbox facilitator.
 *
 * Models the standard Iranian IPG facilitator (پرداخت‌یار) cycle:
 *   request → redirectUrl → [simulatePaid / simulateCancelled] → verify → inquire
 *
 * Design principles:
 * - Sessions are stored in a Map (in-process, no external dependency).
 * - verify() is the ONLY authoritative source of status — redirect params carry
 *   no trusted state.
 * - verify() is idempotent: repeated calls return the same result.
 * - simulatePaid() / simulateCancelled() mimic the gateway's hosted-payment page
 *   confirming or rejecting the payment, WITHOUT encoding that state in the URL.
 *
 * Use for: unit tests, integration tests, local development, CI.
 * Selected by: PAYMENT_PROVIDER=simulated (or unset — this is the default).
 */

import { nanoid } from "nanoid";
import type {
  PaymentProvider,
  PaymentRequestInput,
  PaymentRequestResult,
  PaymentVerifyResult,
  PaymentInquireResult,
  RefundViaPayoutInput,
  RefundViaPayoutResult,
  OnboardSubMerchantInput,
  OnboardSubMerchantResult,
  VerifyIbanInput,
  VerifyIbanResult,
} from "../provider";

type SessionStatus = "pending" | "succeeded" | "failed";

interface SimulatedSession {
  ref: string;
  amount: bigint;
  orderId: string;
  callbackUrl: string;
  status: SessionStatus;
  refNumber?: string;
}

const SIMULATED_GATEWAY_BASE_URL = "https://sandbox.shaparak.test/pay";
const VALID_IBAN_PREFIX = "IR";
const VALID_IBAN_MIN_LENGTH = 26;

export class SimulatedPaymentAdapter implements PaymentProvider {
  private readonly sessions = new Map<string, SimulatedSession>();

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const ref = `sim_${nanoid(16)}`;
    this.sessions.set(ref, {
      ref,
      amount: input.amount,
      orderId: input.orderId,
      callbackUrl: input.callbackUrl,
      status: "pending",
    });
    return { ref };
  }

  redirectUrl(ref: string): string {
    return `${SIMULATED_GATEWAY_BASE_URL}/${ref}`;
  }

  async verify(ref: string): Promise<PaymentVerifyResult> {
    const session = this.sessions.get(ref);
    if (!session) {
      return { status: "failed" };
    }
    if (session.status === "succeeded") {
      return { status: "succeeded", amount: session.amount, refNumber: session.refNumber };
    }
    if (session.status === "failed") {
      return { status: "failed" };
    }
    return { status: "pending" };
  }

  async inquire(ref: string): Promise<PaymentInquireResult> {
    const session = this.sessions.get(ref);
    if (!session) {
      return { status: "failed" };
    }
    return { status: session.status, amount: session.amount };
  }

  async refundViaPayout(refundInput: RefundViaPayoutInput): Promise<RefundViaPayoutResult> {
    const payoutRef = `payout_${refundInput.paymentRef.slice(0, 4)}_${nanoid(12)}`;
    return { payoutRef, status: "succeeded" };
  }

  async onboardSubMerchant(merchantInput: OnboardSubMerchantInput): Promise<OnboardSubMerchantResult> {
    const subMerchantId = `sub_${merchantInput.nationalId.slice(0, 4)}_${nanoid(8)}`;
    return { subMerchantId };
  }

  async verifyIban(input: VerifyIbanInput): Promise<VerifyIbanResult> {
    const isValid =
      input.iban.startsWith(VALID_IBAN_PREFIX) &&
      input.iban.length >= VALID_IBAN_MIN_LENGTH;
    if (!isValid) {
      return { verified: false };
    }
    return { verified: true, holderName: "صاحب حساب آزمایشی" };
  }

  /**
   * Test-only helpers — simulate what happens on the gateway's hosted page.
   * Production adapters do not expose these methods; they are driven by real
   * cardholder interactions and server-to-server callbacks.
   */

  simulatePaid(ref: string): void {
    const session = this.sessions.get(ref);
    if (!session) return;
    session.status = "succeeded";
    session.refNumber = `REF${nanoid(10).toUpperCase()}`;
  }

  simulateCancelled(ref: string): void {
    const session = this.sessions.get(ref);
    if (!session) return;
    session.status = "failed";
  }

  /**
   * Exposes the raw session for assertion in unit tests.
   * Do NOT use outside of test code.
   */
  getSessionForTest(ref: string): SimulatedSession | undefined {
    return this.sessions.get(ref);
  }
}
