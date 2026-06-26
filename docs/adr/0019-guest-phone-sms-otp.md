# ADR-0019 — Guest Phone + SMS OTP with Provider Abstraction and Outage Fallback

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #18 (M5 — Ordering & Dashboards)

---

## Context

Guests at Iranian restaurants need optional phone-based identity for receipts and reviews. The system must:

1. Verify phone numbers via SMS OTP without blocking payment.
2. Handle Iranian SMS filtering and outages gracefully.
3. Normalize Persian (۰-۹) and Arabic-Indic (٠-٩) digit families to E.164.
4. Allow restaurant operators to vouch for guests when SMS is unavailable.
5. Run fully in dev/test without real SMS credentials.

The key constraint from the PRD: **OTP is identity/receipt-only — payment must proceed without it during SMS outages.** This is not a payment authentication step.

---

## Decisions

### 1. OTP lifecycle (`src/lib/otp.ts`)

- **6-digit numeric code** generated with `crypto.randomInt` (CSPRNG).
- **SHA-256 hash of the code** stored — never the plaintext code.
- **TTL: 2 minutes** from issue time.
- **Attempt cap: 5 wrong attempts** invalidate the record (throws `OtpMaxAttemptsError` on the 5th wrong attempt and deletes the record; subsequent attempts throw `OtpInvalidError`).
- **Per-phone rate limit: 3 requests per 10 minutes** (prevents SMS bombing).
- **Per-IP rate limit: 5 requests per minute** (prevents IP-based enumeration).
- **One-time use:** successful verification deletes the record.
- **Code normalization:** Persian and Arabic-Indic digits in the submitted code are normalized before hashing, so users who type `۱۲۳۴۵۶` get the same result as `123456`.

### 2. OTP storage

- **Redis** (via `REDIS_URL`) with `PXAT` expiry for atomic TTL enforcement.
- **In-memory fallback** (`InMemoryOtpStorage`) when `REDIS_URL` is unset — safe for dev/single-instance, not suitable for multi-instance production.
- Production MUST set `REDIS_URL` (same Redis instance as rate-limiting) for cross-instance OTP consistency.

### 3. SMS provider abstraction (`src/lib/sms-provider.ts`)

A single `SmsProvider` interface:

```ts
interface SmsProvider {
  name: string;
  send(input: { toE164: string; code: string }): Promise<SmsSendResult>;
}
```

Three concrete implementations:

| Adapter | When active |
|---|---|
| `ConsoleSmsProvider` | `NODE_ENV !== "production"` and no credentials |
| Primary HTTP adapter | `SMS_PRIMARY_*` env vars set |
| Fallback HTTP adapter | `SMS_FALLBACK_*` env vars set |

A **chain adapter** tries primary first; if it fails or is absent, tries fallback; if both fail, returns `{ sent: false, reason: "unavailable" }`. In production without credentials, the adapter also returns `unavailable`.

**Pre-approved OTP template** (required for Iranian SMS operator compliance):
```
کد تأیید qlub شما: {code}
این کد ۲ دقیقه اعتبار دارد.
```

Both provider adapters use this template verbatim to avoid filtering by Iranian SMS operators.

### 4. Phone normalization (`src/lib/phone.ts`)

- Delegates digit normalization to `digit-normalizer.ts` (existing module).
- Recognizes Iranian mobile numbers in three input forms:
  - Local: `09XXXXXXXXX` (11 digits)
  - E.164 with `+98` prefix
  - IDD with `0098` prefix
- Normalizes all forms to `+98XXXXXXXXX`.
- Validates national mobile prefix: must start with `9` and be 10 digits.
- Throws `PhoneNormalizationError` for non-Iranian mobiles, landlines, or malformed input.

### 5. Graceful degradation

`SmsUnavailableError` (distinct error class with `code: "SMS_UNAVAILABLE"`) is thrown when the SMS provider returns `unavailable`. The API route returns `HTTP 503` with `{ "error": "sms_unavailable", "degraded": true }`. The guest app should catch this and skip OTP, proceeding directly to payment.

This ensures: **payment always proceeds, even when every SMS provider is down.**

### 6. Schema changes

```prisma
model Order {
  phoneVerifiedAt  DateTime?   // set on OTP verify or operator override
}

model Vendor {
  otpGateEnabled   Boolean @default(false)  // enables the pre-fire OTP gate
}
```

`phoneVerifiedAt` being `null` means the guest has not verified their phone. Payment is never blocked on this field.

### 7. Operator override (`POST /api/admin/otp-override`)

When `Vendor.otpGateEnabled` is true, the guest UI may prompt for OTP before payment. However, a waiter (any staff role or above) can override this gate by calling the admin override endpoint, which sets `Order.phoneVerifiedAt` and writes to the `AuditLog`. The override is tenant-isolated (order must belong to the session user's vendor).

### 8. API routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/otp/request` | public | Send OTP to phone; rate-limited per-phone and per-IP |
| `POST /api/otp/verify` | public | Verify OTP code; sets `phoneVerifiedAt` on the order |
| `POST /api/admin/otp-override` | staff+ | Operator override; sets `phoneVerifiedAt` + audit log |

---

## Rationale

### Why not `libphonenumber-js`?

The PRD references `libphonenumber-js` but the implementation deliberately uses a simpler, purpose-built normalizer. Iranian mobile numbers follow a strict format (`09XXXXXXXXX` → `+98XXXXXXXXX`) that does not require a 70 kB library. The `digit-normalizer.ts` already handles the Unicode digit families. Adding a heavy dependency for a predictable three-form normalization would be disproportionate.

If we add non-Iranian locales (currently out of scope per the PRD), migrating to `libphonenumber-js` is straightforward.

### Why Redis for OTP storage, not Postgres?

OTP records have a short, hard TTL (2 minutes) and high write/delete frequency. Storing them in Postgres would add unnecessary table churn and require a background sweep to expire old records. Redis' native `PXAT` expiry makes this automatic and atomic.

### Why hash codes with SHA-256 instead of bcrypt?

OTP codes are short-lived (2 minutes), 6-digit (1,000,000 possibilities), and already rate-limited to 5 attempts. A full bcrypt hash is unnecessary overhead. SHA-256 is used purely to avoid storing plaintext codes in Redis — not as a general-purpose password KDF.

---

## Consequences

- **Positive:** SMS outages cannot block payment. Operators can vouch for guests. Dev works without credentials.
- **Positive:** Two providers behind one interface means the active provider can change without code changes.
- **Positive:** Digit normalization is consistent with the rest of the codebase (reuses `digit-normalizer.ts`).
- **Negative:** In-memory OTP storage and rate limiters are process-local; multi-instance production requires `REDIS_URL`.
- **Negative:** The OTP approved template is hardcoded; if the template changes, it requires a code update and redeployment.
- **To do (Phase 5):** Verify the exact template format required by each chosen Iranian SMS provider and update the adapter request payloads accordingly. The `SMS_*` env vars document the required fields.
