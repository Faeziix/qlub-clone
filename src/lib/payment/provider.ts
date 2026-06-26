/**
 * PaymentProvider — the single interface that every payment facilitator adapter
 * must implement.
 *
 * All money values are integer rial (BigInt) — the canonical internal unit.
 * Conversion to/from gateway-expected units is the adapter's responsibility,
 * using the boundaries defined in money.ts.
 *
 * The interface models the standard Iranian IPG facilitator (پرداخت‌یار) cycle:
 *   request → redirectUrl → [browser pays] → verify (server-side) → inquire
 *
 * Server-side verify is NON-NEGOTIABLE: the redirect success param is NEVER
 * trusted. verify() is the only authoritative source of payment status.
 *
 * The concrete live facilitator adapter is added under issue #5.
 * The active adapter is selected via the PAYMENT_PROVIDER env variable.
 * The default (no env set) is the simulated adapter so tests/build require
 * no external account.
 */

export interface PaymentRequestInput {
  merchantId: string;
  amount: bigint;
  callbackUrl: string;
  orderId: string;
  description?: string;
  mobile?: string;
  multiplexingInfos?: MultiplexingInfo[];
}

export interface MultiplexingInfo {
  iban: string;
  amount: bigint;
  description?: string;
}

export interface PaymentRequestResult {
  ref: string;
}

export interface PaymentVerifyResult {
  status: "succeeded" | "failed" | "pending";
  amount?: bigint;
  refNumber?: string;
}

export interface PaymentInquireResult {
  status: "succeeded" | "failed" | "pending";
  amount?: bigint;
}

export interface RefundViaPayoutInput {
  paymentRef: string;
  amount: bigint;
  destinationIban: string;
  description?: string;
}

export interface RefundViaPayoutResult {
  payoutRef: string;
  status: "succeeded" | "failed" | "pending";
}

export interface OnboardSubMerchantInput {
  nationalId: string;
  businessName: string;
  iban: string;
  mobile?: string;
  email?: string;
}

export interface OnboardSubMerchantResult {
  subMerchantId: string;
}

export interface VerifyIbanInput {
  iban: string;
  nationalId?: string;
}

export interface VerifyIbanResult {
  verified: boolean;
  holderName?: string;
}

export interface PaymentProvider {
  /**
   * Initiates a payment session with the gateway. Returns a ref (trackId /
   * authority) that identifies this session. The amount is in integer rial.
   */
  request(input: PaymentRequestInput): Promise<PaymentRequestResult>;

  /**
   * Returns the browser redirect URL for the given ref. The browser navigates
   * here so the diner can complete payment on the gateway's hosted page.
   *
   * The URL must NOT embed authoritative payment status or amount — those are
   * only available via verify() after the redirect completes.
   */
  redirectUrl(ref: string): string;

  /**
   * SERVER-SIDE verification of the payment result. This is the ONLY
   * authoritative source of payment status.
   *
   * MUST be called after the browser redirect (callback) arrives.
   * NEVER trust the callback query-string status param — always call this.
   * Idempotent: multiple verify() calls for the same ref return the same result.
   */
  verify(ref: string): Promise<PaymentVerifyResult>;

  /**
   * Queries the current status of a payment session. Used by the reconciliation
   * sweep to detect orphaned pending payments and resolve them.
   */
  inquire(ref: string): Promise<PaymentInquireResult>;

  /**
   * Issues a refund as a wallet-funded payout to the diner's IBAN.
   * Not a card-rail reversal — a separate ledgered payout from the platform wallet.
   */
  refundViaPayout(input: RefundViaPayoutInput): Promise<RefundViaPayoutResult>;

  /**
   * Registers a restaurant as a payment sub-merchant under the facilitator.
   * Requires KYC fields (nationalId, business license). Returns the sub-merchant
   * ID to store on Vendor.gatewaySubMerchantId.
   */
  onboardSubMerchant(input: OnboardSubMerchantInput): Promise<OnboardSubMerchantResult>;

  /**
   * Verifies that an IBAN belongs to the stated national ID holder via the
   * facilitator's CBI inquiry service. Required before enabling payouts.
   */
  verifyIban(input: VerifyIbanInput): Promise<VerifyIbanResult>;
}
