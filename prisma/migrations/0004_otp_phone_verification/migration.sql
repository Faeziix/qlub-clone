-- Add OTP phone verification support (issue #18)
-- phoneVerifiedAt on Order: set when a guest verifies their phone via OTP
-- or when an operator uses the override. NULL = not yet verified.
-- otpGateEnabled on Vendor: when true, payment is gated on phone OTP
-- (with graceful degradation + operator override on SMS outage).

ALTER TABLE "Order" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

ALTER TABLE "Vendor" ADD COLUMN "otpGateEnabled" BOOLEAN NOT NULL DEFAULT false;
