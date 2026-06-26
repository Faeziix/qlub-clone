/**
 * OTP lifecycle management for guest phone verification.
 *
 * Generates a 6-digit code, stores a SHA-256 hash (never the plaintext) in
 * Redis with a 2-minute TTL, enforces an attempt cap (5 per code), and applies
 * per-phone + per-IP rate limits. Phone numbers are normalized to E.164 before
 * any operation.
 *
 * OTP is identity/receipt-only and MUST NOT block payment. All callers must
 * handle `SmsUnavailableError` by skipping OTP and proceeding.
 *
 * Storage layout in Redis:
 *   otp:code:{phone E.164}   →  JSON { hash, expiresAt, attempts }
 *   otp:rate:{phone E.164}   →  managed by InMemoryRateLimiter / RedisRateLimiter
 *   otp:rate:ip:{ip}         →  same
 *
 * See docs/adr/0019-guest-phone-sms-otp.md.
 */

import { createHash, randomInt } from "crypto";
import { normalizePhoneToE164 } from "./phone";
import { normalizeDigits } from "./digit-normalizer";
import { getSmsProvider } from "./sms-provider";
import { InMemoryRateLimiter, RedisRateLimiter } from "./rate-limiter";

export class SmsUnavailableError extends Error {
  readonly code = "SMS_UNAVAILABLE" as const;
  constructor() {
    super("SMS service is currently unavailable");
  }
}

export class OtpRateLimitError extends Error {
  readonly code = "OTP_RATE_LIMIT" as const;
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Too many OTP requests — please wait before trying again");
    this.retryAfterMs = retryAfterMs;
  }
}

export class OtpInvalidError extends Error {
  readonly code = "OTP_INVALID" as const;
  constructor() {
    super("Invalid or expired OTP code");
  }
}

export class OtpMaxAttemptsError extends Error {
  readonly code = "OTP_MAX_ATTEMPTS" as const;
  constructor() {
    super("Maximum verification attempts exceeded — request a new code");
  }
}

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_DIGITS = 6;

const PER_PHONE_WINDOW_MS = 10 * 60 * 1000;
const PER_PHONE_MAX_REQUESTS = 3;
const PER_IP_WINDOW_MS = 60 * 1000;
const PER_IP_MAX_REQUESTS = 5;

interface OtpRecord {
  hash: string;
  expiresAt: number;
  attempts: number;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");
}

function otpRedisKey(phoneE164: string): string {
  return `otp:code:${phoneE164}`;
}

function phoneRateLimitKey(phoneE164: string): string {
  return `otp:rate:phone:${phoneE164}`;
}

function ipRateLimitKey(ip: string): string {
  return `otp:rate:ip:${ip}`;
}

async function buildOtpRateLimiter(windowMs: number, maxRequests: number) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return new InMemoryRateLimiter({ windowMs, maxRequests });
  }
  try {
    const redisModule = await import(/* webpackIgnore: true */ "redis" as string);
    const { createClient } = redisModule as {
      createClient: (opts: { url: string }) => {
        connect(): Promise<void>;
        incr(key: string): Promise<number>;
        pexpire(key: string, ms: number): Promise<number>;
        pttl(key: string): Promise<number>;
        del(key: string): Promise<number>;
        set(key: string, value: string, opts: { pxat: number }): Promise<unknown>;
        get(key: string): Promise<string | null>;
      };
    };
    const client = createClient({ url: redisUrl });
    await client.connect();
    return new RedisRateLimiter({ windowMs, maxRequests }, client);
  } catch {
    return new InMemoryRateLimiter({ windowMs, maxRequests });
  }
}

let _phoneRateLimiter: InMemoryRateLimiter | RedisRateLimiter | null = null;
let _ipRateLimiter: InMemoryRateLimiter | RedisRateLimiter | null = null;

async function getPhoneRateLimiter() {
  if (!_phoneRateLimiter) {
    _phoneRateLimiter = (await buildOtpRateLimiter(
      PER_PHONE_WINDOW_MS,
      PER_PHONE_MAX_REQUESTS
    )) as InMemoryRateLimiter | RedisRateLimiter;
  }
  return _phoneRateLimiter;
}

async function getIpRateLimiter() {
  if (!_ipRateLimiter) {
    _ipRateLimiter = (await buildOtpRateLimiter(
      PER_IP_WINDOW_MS,
      PER_IP_MAX_REQUESTS
    )) as InMemoryRateLimiter | RedisRateLimiter;
  }
  return _ipRateLimiter;
}

export function resetOtpRateLimitersForTesting(
  phone: InMemoryRateLimiter,
  ip: InMemoryRateLimiter
): void {
  _phoneRateLimiter = phone;
  _ipRateLimiter = ip;
}

interface OtpStorage {
  set(key: string, value: string, expiresAt: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

class InMemoryOtpStorage implements OtpStorage {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, expiresAt: number): Promise<void> {
    this.store.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class RedisOtpStorage implements OtpStorage {
  constructor(
    private readonly client: {
      set(key: string, value: string, opts: { pxat: number }): Promise<unknown>;
      get(key: string): Promise<string | null>;
      del(key: string): Promise<number>;
    }
  ) {}

  async set(key: string, value: string, expiresAt: number): Promise<void> {
    await this.client.set(key, value, { pxat: expiresAt });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

let _otpStorage: OtpStorage | null = null;

async function getOtpStorage(): Promise<OtpStorage> {
  if (_otpStorage) return _otpStorage;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    _otpStorage = new InMemoryOtpStorage();
    return _otpStorage;
  }

  try {
    const redisModule = await import(/* webpackIgnore: true */ "redis" as string);
    const { createClient } = redisModule as {
      createClient: (opts: { url: string }) => {
        connect(): Promise<void>;
        set(key: string, value: string, opts: { pxat: number }): Promise<unknown>;
        get(key: string): Promise<string | null>;
        del(key: string): Promise<number>;
      };
    };
    const client = createClient({ url: redisUrl });
    await client.connect();
    _otpStorage = new RedisOtpStorage(client);
    return _otpStorage;
  } catch {
    _otpStorage = new InMemoryOtpStorage();
    return _otpStorage;
  }
}

export function resetOtpStorageForTesting(storage: InMemoryOtpStorage): void {
  _otpStorage = storage;
}

export { InMemoryOtpStorage };

export interface OtpRequestResult {
  sent: true;
  phoneE164: string;
}

export async function requestOtp(input: {
  rawPhone: string;
  ip: string;
}): Promise<OtpRequestResult> {
  const phoneE164 = normalizePhoneToE164(input.rawPhone);

  const [phoneRateLimiter, ipRateLimiter] = await Promise.all([
    getPhoneRateLimiter(),
    getIpRateLimiter(),
  ]);

  const [phoneLimit, ipLimit] = await Promise.all([
    phoneRateLimiter.check(phoneRateLimitKey(phoneE164)),
    ipRateLimiter.check(ipRateLimitKey(input.ip)),
  ]);

  if (!phoneLimit.allowed) {
    throw new OtpRateLimitError(phoneLimit.retryAfterMs);
  }
  if (!ipLimit.allowed) {
    throw new OtpRateLimitError(ipLimit.retryAfterMs);
  }

  const code = generateCode();
  const hash = hashCode(code);
  const expiresAt = Date.now() + OTP_TTL_MS;

  const storage = await getOtpStorage();
  const record: OtpRecord = { hash, expiresAt, attempts: 0 };
  await storage.set(otpRedisKey(phoneE164), JSON.stringify(record), expiresAt);

  const smsProvider = getSmsProvider();
  const sendResult = await smsProvider.send({ toE164: phoneE164, code });

  if (!sendResult.sent) {
    throw new SmsUnavailableError();
  }

  return { sent: true, phoneE164 };
}

export interface OtpVerifyResult {
  verified: true;
  phoneE164: string;
}

export async function verifyOtp(input: {
  rawPhone: string;
  code: string;
}): Promise<OtpVerifyResult> {
  const phoneE164 = normalizePhoneToE164(input.rawPhone);
  const normalizedCode = normalizeDigits(input.code.trim());

  const storage = await getOtpStorage();
  const raw = await storage.get(otpRedisKey(phoneE164));

  if (!raw) {
    throw new OtpInvalidError();
  }

  const record: OtpRecord = JSON.parse(raw);

  if (Date.now() > record.expiresAt) {
    await storage.del(otpRedisKey(phoneE164));
    throw new OtpInvalidError();
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await storage.del(otpRedisKey(phoneE164));
    throw new OtpMaxAttemptsError();
  }

  const inputHash = hashCode(normalizedCode);
  if (inputHash !== record.hash) {
    const newAttempts = record.attempts + 1;
    if (newAttempts >= OTP_MAX_ATTEMPTS) {
      await storage.del(otpRedisKey(phoneE164));
      throw new OtpMaxAttemptsError();
    }
    const updatedRecord: OtpRecord = {
      ...record,
      attempts: newAttempts,
    };
    await storage.set(
      otpRedisKey(phoneE164),
      JSON.stringify(updatedRecord),
      record.expiresAt
    );
    throw new OtpInvalidError();
  }

  await storage.del(otpRedisKey(phoneE164));
  return { verified: true, phoneE164 };
}
