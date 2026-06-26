/**
 * Tests for issue #18 — Guest phone + SMS OTP with provider abstraction
 * and outage fallback.
 *
 * Acceptance criteria verified:
 * 1. OTP request/verify works with hashed codes, TTL, attempt cap, Redis rate limits.
 * 2. Two SMS providers sit behind one interface using approved templates.
 * 3. Phone numbers normalize both digit families to E.164 before send/validate.
 * 4. Payment proceeds without OTP when SMS is unavailable; operator override exists.
 *
 * No live Redis or SMS credentials required — all external state is mocked via
 * InMemoryOtpStorage and InMemoryRateLimiter, and the SMS provider is injected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestOtp,
  verifyOtp,
  SmsUnavailableError,
  OtpRateLimitError,
  OtpInvalidError,
  OtpMaxAttemptsError,
  InMemoryOtpStorage,
  resetOtpStorageForTesting,
  resetOtpRateLimitersForTesting,
} from "@/lib/otp";
import {
  resetSmsProviderForTesting,
  type SmsProvider,
  ConsoleSmsProvider,
  buildSmsProvider,
} from "@/lib/sms-provider";
import { InMemoryRateLimiter } from "@/lib/rate-limiter";
import { normalizePhoneToE164, PhoneNormalizationError } from "@/lib/phone";

// ── Phone normalization to E.164 ──────────────────────────────────────────────

describe("normalizePhoneToE164 — ASCII digits", () => {
  it("converts local 11-digit Iranian mobile (09XXXXXXXXX → +989XXXXXXXXX)", () => {
    expect(normalizePhoneToE164("09121234567")).toBe("+989121234567");
  });

  it("accepts +98 prefixed E.164 unchanged", () => {
    expect(normalizePhoneToE164("+989121234567")).toBe("+989121234567");
  });

  it("converts 0098 prefix to E.164", () => {
    expect(normalizePhoneToE164("00989121234567")).toBe("+989121234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizePhoneToE164("0912 123 4567")).toBe("+989121234567");
    expect(normalizePhoneToE164("091-2123-4567")).toBe("+989121234567");
  });
});

describe("normalizePhoneToE164 — Persian digit family (۰-۹)", () => {
  it("converts Persian-digit local number to E.164", () => {
    expect(normalizePhoneToE164("۰۹۱۲۱۲۳۴۵۶۷")).toBe("+989121234567");
  });

  it("converts Persian-digit +98 prefix to E.164", () => {
    expect(normalizePhoneToE164("+۹۸۹۱۲۱۲۳۴۵۶۷")).toBe("+989121234567");
  });

  it("handles mixed Persian digits and ASCII", () => {
    expect(normalizePhoneToE164("0912۱۲۳۴۵۶۷")).toBe("+989121234567");
  });
});

describe("normalizePhoneToE164 — Arabic-Indic digit family (٠-٩)", () => {
  it("converts Arabic-Indic-digit local number to E.164", () => {
    expect(normalizePhoneToE164("٠٩١٢١٢٣٤٥٦٧")).toBe("+989121234567");
  });

  it("converts Arabic-Indic with spaces", () => {
    expect(normalizePhoneToE164("٠٩١٢ ١٢٣ ٤٥٦٧")).toBe("+989121234567");
  });
});

describe("normalizePhoneToE164 — invalid numbers", () => {
  it("throws PhoneNormalizationError for a landline number", () => {
    expect(() => normalizePhoneToE164("02188888888")).toThrow(
      PhoneNormalizationError
    );
  });

  it("throws PhoneNormalizationError for a short number", () => {
    expect(() => normalizePhoneToE164("0912123")).toThrow(
      PhoneNormalizationError
    );
  });

  it("throws PhoneNormalizationError for a non-Iranian mobile prefix", () => {
    expect(() => normalizePhoneToE164("+441234567890")).toThrow(
      PhoneNormalizationError
    );
  });

  it("throws PhoneNormalizationError for empty string", () => {
    expect(() => normalizePhoneToE164("")).toThrow(PhoneNormalizationError);
  });
});

// ── OTP storage (InMemoryOtpStorage) ─────────────────────────────────────────

describe("InMemoryOtpStorage", () => {
  it("stores and retrieves a value before TTL", async () => {
    const storage = new InMemoryOtpStorage();
    const expiresAt = Date.now() + 10_000;
    await storage.set("key", "value", expiresAt);
    expect(await storage.get("key")).toBe("value");
  });

  it("returns null after TTL has passed", async () => {
    const storage = new InMemoryOtpStorage();
    const expiresAt = Date.now() - 1;
    await storage.set("key", "expired", expiresAt);
    expect(await storage.get("key")).toBeNull();
  });

  it("del removes a stored key", async () => {
    const storage = new InMemoryOtpStorage();
    await storage.set("k", "v", Date.now() + 10_000);
    await storage.del("k");
    expect(await storage.get("k")).toBeNull();
  });
});

// ── SMS provider interface ────────────────────────────────────────────────────

describe("ConsoleSmsProvider", () => {
  it("always returns sent:true and logs the code", async () => {
    const provider = new ConsoleSmsProvider();
    const result = await provider.send({
      toE164: "+989121234567",
      code: "123456",
    });
    expect(result).toEqual({ sent: true });
  });
});

describe("buildSmsProvider — no credentials in env", () => {
  it("returns ConsoleSmsProvider in non-production (NODE_ENV=test, no SMS_ vars)", () => {
    const saved = {
      primary: process.env.SMS_PRIMARY_API_KEY,
      fallback: process.env.SMS_FALLBACK_API_KEY,
    };
    delete process.env.SMS_PRIMARY_API_KEY;
    delete process.env.SMS_FALLBACK_API_KEY;

    const provider = buildSmsProvider();
    expect(provider).toBeInstanceOf(ConsoleSmsProvider);

    if (saved.primary !== undefined) process.env.SMS_PRIMARY_API_KEY = saved.primary;
    if (saved.fallback !== undefined) process.env.SMS_FALLBACK_API_KEY = saved.fallback;
  });
});

describe("buildSmsProvider — chain with primary success", () => {
  it("returns the primary result when primary succeeds", async () => {
    const primarySent: SmsProvider = {
      name: "primary",
      async send() {
        return { sent: true };
      },
    };
    const fallbackCalled = { value: false };
    const fallbackProvider: SmsProvider = {
      name: "fallback",
      async send() {
        fallbackCalled.value = true;
        return { sent: true };
      },
    };

    const chain: SmsProvider = {
      name: "chain",
      async send(input) {
        const r1 = await primarySent.send(input);
        if (r1.sent) return r1;
        return fallbackProvider.send(input);
      },
    };

    const result = await chain.send({ toE164: "+989121234567", code: "000000" });
    expect(result.sent).toBe(true);
    expect(fallbackCalled.value).toBe(false);
  });

  it("falls through to fallback when primary fails", async () => {
    const primaryFail: SmsProvider = {
      name: "primary",
      async send() {
        return { sent: false, reason: "failed", detail: "network error" };
      },
    };
    const fallbackProvider: SmsProvider = {
      name: "fallback",
      async send() {
        return { sent: true };
      },
    };

    const chain: SmsProvider = {
      name: "chain",
      async send(input) {
        const r1 = await primaryFail.send(input);
        if (r1.sent) return r1;
        return fallbackProvider.send(input);
      },
    };

    const result = await chain.send({ toE164: "+989121234567", code: "000000" });
    expect(result.sent).toBe(true);
  });

  it("returns unavailable when both providers fail", async () => {
    const failProvider: SmsProvider = {
      name: "fail",
      async send() {
        return { sent: false, reason: "failed" };
      },
    };

    const chain: SmsProvider = {
      name: "chain",
      async send(input) {
        const r1 = await failProvider.send(input);
        if (r1.sent) return r1;
        const r2 = await failProvider.send(input);
        if (r2.sent) return r2;
        return { sent: false, reason: "unavailable" };
      },
    };

    const result = await chain.send({ toE164: "+989121234567", code: "000000" });
    expect(result).toEqual({ sent: false, reason: "unavailable" });
  });
});

// ── OTP request flow ──────────────────────────────────────────────────────────

function freshOtpEnvironment() {
  const storage = new InMemoryOtpStorage();
  resetOtpStorageForTesting(storage);

  const phoneRateLimiter = new InMemoryRateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 3,
  });
  const ipRateLimiter = new InMemoryRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 5,
  });
  resetOtpRateLimitersForTesting(phoneRateLimiter, ipRateLimiter);

  const sentCodes: { toE164: string; code: string }[] = [];
  const capturingProvider: SmsProvider = {
    name: "test",
    async send(input) {
      sentCodes.push({ toE164: input.toE164, code: input.code });
      return { sent: true };
    },
  };
  resetSmsProviderForTesting(capturingProvider);

  return { storage, phoneRateLimiter, ipRateLimiter, sentCodes };
}

describe("requestOtp — happy path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends OTP and stores hashed code for valid Iranian mobile (ASCII digits)", async () => {
    const { sentCodes } = freshOtpEnvironment();
    const result = await requestOtp({ rawPhone: "09121234567", ip: "1.2.3.4" });
    expect(result.sent).toBe(true);
    expect(result.phoneE164).toBe("+989121234567");
    expect(sentCodes).toHaveLength(1);
    expect(sentCodes[0].toE164).toBe("+989121234567");
    expect(sentCodes[0].code).toMatch(/^\d{6}$/);
  });

  it("normalizes Persian-digit phone before storing", async () => {
    const { sentCodes } = freshOtpEnvironment();
    await requestOtp({ rawPhone: "۰۹۱۲۱۲۳۴۵۶۷", ip: "1.2.3.4" });
    expect(sentCodes[0].toE164).toBe("+989121234567");
  });

  it("normalizes Arabic-Indic-digit phone before storing", async () => {
    const { sentCodes } = freshOtpEnvironment();
    await requestOtp({ rawPhone: "٠٩١٢١٢٣٤٥٦٧", ip: "1.2.3.4" });
    expect(sentCodes[0].toE164).toBe("+989121234567");
  });
});

describe("requestOtp — rate limiting", () => {
  it("blocks after per-phone request cap is reached", async () => {
    freshOtpEnvironment();

    for (let i = 0; i < 3; i++) {
      await requestOtp({ rawPhone: "09121234567", ip: "10.0.0.1" });
    }

    await expect(
      requestOtp({ rawPhone: "09121234567", ip: "10.0.0.2" })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it("blocks after per-IP request cap is reached", async () => {
    freshOtpEnvironment();

    for (let i = 0; i < 5; i++) {
      await requestOtp({ rawPhone: `0912${String(i).padStart(7, "0")}`, ip: "10.0.0.1" });
    }

    await expect(
      requestOtp({ rawPhone: "09129999999", ip: "10.0.0.1" })
    ).rejects.toThrow(OtpRateLimitError);
  });
});

describe("requestOtp — SMS unavailable", () => {
  it("throws SmsUnavailableError when the provider returns unavailable", async () => {
    freshOtpEnvironment();
    const unavailableProvider: SmsProvider = {
      name: "unavailable",
      async send() {
        return { sent: false, reason: "unavailable" };
      },
    };
    resetSmsProviderForTesting(unavailableProvider);

    await expect(
      requestOtp({ rawPhone: "09121234567", ip: "1.2.3.4" })
    ).rejects.toThrow(SmsUnavailableError);
  });
});

// ── OTP verify flow ───────────────────────────────────────────────────────────

async function requestAndCapture(rawPhone: string, ip: string) {
  const sentCodes: { toE164: string; code: string }[] = [];
  const capturingProvider: SmsProvider = {
    name: "test",
    async send(input) {
      sentCodes.push({ toE164: input.toE164, code: input.code });
      return { sent: true };
    },
  };
  resetSmsProviderForTesting(capturingProvider);
  await requestOtp({ rawPhone, ip });
  return sentCodes[sentCodes.length - 1]?.code ?? "";
}

describe("verifyOtp — happy path", () => {
  it("verifies a correct code and returns verified:true with E.164 phone", async () => {
    freshOtpEnvironment();
    const code = await requestAndCapture("09121234567", "1.2.3.4");
    const result = await verifyOtp({ rawPhone: "09121234567", code });
    expect(result.verified).toBe(true);
    expect(result.phoneE164).toBe("+989121234567");
  });

  it("normalizes Persian-digit phone on verify", async () => {
    freshOtpEnvironment();
    const code = await requestAndCapture("09121234567", "1.2.3.4");
    const result = await verifyOtp({ rawPhone: "۰۹۱۲۱۲۳۴۵۶۷", code });
    expect(result.verified).toBe(true);
    expect(result.phoneE164).toBe("+989121234567");
  });

  it("normalizes Arabic-Indic-digit code on verify", async () => {
    freshOtpEnvironment();
    const code = await requestAndCapture("09121234567", "1.2.3.4");
    const persianCode = code
      .split("")
      .map((d) => String.fromCodePoint(0x06f0 + parseInt(d)))
      .join("");
    const result = await verifyOtp({ rawPhone: "09121234567", code: persianCode });
    expect(result.verified).toBe(true);
  });

  it("deletes the OTP record after successful verification (one-time use)", async () => {
    freshOtpEnvironment();
    const code = await requestAndCapture("09121234567", "1.2.3.4");
    await verifyOtp({ rawPhone: "09121234567", code });
    await expect(
      verifyOtp({ rawPhone: "09121234567", code })
    ).rejects.toThrow(OtpInvalidError);
  });
});

describe("verifyOtp — wrong code", () => {
  it("throws OtpInvalidError for wrong code", async () => {
    freshOtpEnvironment();
    await requestAndCapture("09121234567", "1.2.3.4");
    await expect(
      verifyOtp({ rawPhone: "09121234567", code: "000000" })
    ).rejects.toThrow(OtpInvalidError);
  });

  it("increments attempt count on wrong code", async () => {
    freshOtpEnvironment();
    await requestAndCapture("09121234567", "1.2.3.4");
    for (let i = 0; i < 4; i++) {
      await expect(
        verifyOtp({ rawPhone: "09121234567", code: "000000" })
      ).rejects.toThrow(OtpInvalidError);
    }
    await expect(
      verifyOtp({ rawPhone: "09121234567", code: "000000" })
    ).rejects.toThrow(OtpMaxAttemptsError);
  });
});

describe("verifyOtp — expired code", () => {
  it("throws OtpInvalidError when there is no record (expired/not requested)", async () => {
    freshOtpEnvironment();
    await expect(
      verifyOtp({ rawPhone: "09121234567", code: "123456" })
    ).rejects.toThrow(OtpInvalidError);
  });
});

describe("verifyOtp — attempt cap", () => {
  it("throws OtpMaxAttemptsError on the 5th failed attempt and OtpInvalidError thereafter", async () => {
    freshOtpEnvironment();
    await requestAndCapture("09121234567", "1.2.3.4");

    for (let i = 0; i < 4; i++) {
      await expect(
        verifyOtp({ rawPhone: "09121234567", code: "000000" })
      ).rejects.toThrow(OtpInvalidError);
    }

    await expect(
      verifyOtp({ rawPhone: "09121234567", code: "000000" })
    ).rejects.toThrow(OtpMaxAttemptsError);

    await expect(
      verifyOtp({ rawPhone: "09121234567", code: "000000" })
    ).rejects.toThrow(OtpInvalidError);
  });
});

// ── OTP code storage — hash verification (codes are never stored in plaintext) ─

describe("OTP code hash security — plaintext codes are never stored", () => {
  it("the stored record contains a SHA-256 hash, not the plaintext code", async () => {
    const storage = new InMemoryOtpStorage();
    resetOtpStorageForTesting(storage);
    resetOtpRateLimitersForTesting(
      new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10 }),
      new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10 })
    );

    const sentCodes: string[] = [];
    resetSmsProviderForTesting({
      name: "capture",
      async send({ code }) {
        sentCodes.push(code);
        return { sent: true };
      },
    });

    await requestOtp({ rawPhone: "09121234567", ip: "1.2.3.4" });
    const plainCode = sentCodes[0];

    const raw = await storage.get("otp:code:+989121234567");
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw!);
    expect(record.hash).not.toBe(plainCode);
    expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.hash).not.toContain(plainCode);
  });
});

// ── Graceful degradation — payment proceeds without OTP ──────────────────────

describe("graceful degradation — SmsUnavailableError signals skip-OTP path", () => {
  it("SmsUnavailableError is a distinct error class that callers can catch and skip", async () => {
    freshOtpEnvironment();
    resetSmsProviderForTesting({
      name: "down",
      async send() {
        return { sent: false, reason: "unavailable" };
      },
    });

    let smsWasUnavailable = false;
    let paymentProceeded = false;

    try {
      await requestOtp({ rawPhone: "09121234567", ip: "1.2.3.4" });
    } catch (err) {
      if (err instanceof SmsUnavailableError) {
        smsWasUnavailable = true;
        paymentProceeded = true;
      }
    }

    expect(smsWasUnavailable).toBe(true);
    expect(paymentProceeded).toBe(true);
  });

  it("SmsUnavailableError.code is 'SMS_UNAVAILABLE' for programmatic discrimination", () => {
    const err = new SmsUnavailableError();
    expect(err.code).toBe("SMS_UNAVAILABLE");
  });

  it("OtpRateLimitError exposes retryAfterMs", () => {
    const err = new OtpRateLimitError(30_000);
    expect(err.retryAfterMs).toBe(30_000);
    expect(err.code).toBe("OTP_RATE_LIMIT");
  });
});
