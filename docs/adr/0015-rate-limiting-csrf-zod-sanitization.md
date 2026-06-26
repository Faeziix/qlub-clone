# ADR-0015 — Rate Limiting, Login Lockout, Zod Validation, Sanitization, CSRF/Origin Checks

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #15 (M4 — Access & Anti-Abuse)

---

## Context

Public endpoints (`/api/orders`, `/api/payments`, `/api/reviews`) and the admin
login action were unprotected against:

1. **Request flooding / brute-force** — no cap on how many requests a single IP
   or credential can make per time window.
2. **Login brute-force / credential stuffing** — login attempted unlimited times
   against any email address.
3. **Free-text XSS** — `notes`, `comment`, and `guestName` fields persisted
   user-supplied strings with no stripping of HTML/script content; these can
   appear verbatim in admin views.
4. **CSRF on public POST routes** — no origin check; a cross-origin request
   from any site could POST to the orders/payments/reviews endpoints.
5. **Internal error leakage** — catch blocks surfaced raw `err.message` strings
   from Prisma or business logic; those strings may expose schema details,
   table names, or internal identifiers.

---

## Decision

### 1. `RateLimiter` interface with two adapters (`src/lib/rate-limiter.ts`)

A minimal interface:

```ts
interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}
```

Two concrete implementations:

- **`InMemoryRateLimiter`** — fixed-window counter in a `Map`. Default when
  `REDIS_URL` is absent. State is process-local and lost on restart.
- **`RedisRateLimiter`** — the same algorithm backed by Redis INCR + PEXPIRE.
  Active when `REDIS_URL` is set. Survives restarts and is shared across all
  app instances (required for production multi-instance).

The `buildRateLimiter(options)` factory selects the adapter at runtime from env.
The `redis` package is dynamically imported so the build succeeds without it.

**Production MUST set `REDIS_URL`** for multi-instance correctness. This is
documented in `.env.example` and below.

### 2. Singleton limiter instances (`src/lib/limiters.ts`)

Three named limiters with tuned windows:

| Limiter | Key pattern | Window | Max requests |
|---|---|---|---|
| `publicApi` | `orders:<ip>`, `payments:<ip>`, `reviews:<ip>` | 60 s | 60 |
| `adminAction` | (reserved for future admin mutation guard) | 60 s | 120 |
| `login` | `login:<email>` | 5 min | 5 |

### 3. Login lockout (`src/app/[locale]/admin/actions.ts`)

Before password verification, `login` calls `loginLimiter.check("login:<email>")`.
If the account key is exhausted, it returns `{ errorKey: "tooManyAttempts" }`
without revealing whether the account exists. On successful login the counter is
reset via `loginLimiter.reset(...)` so a legitimate user who previously failed
is not permanently locked.

### 4. Public POST route hardening

Each of `/api/orders`, `/api/payments`, `/api/reviews` now:

1. **Checks origin** via `checkOrigin(req)` — rejects cross-origin requests
   (returns generic `400 Bad request` with no detail).
2. **Rate-limits per IP** via `publicApiLimiter` — returns `429` with a
   `Retry-After` header on exhaustion.
3. **Validates via Zod** with explicit `.min(1).max(N)` on string fields —
   tighter bounds than the previous permissive schema.
4. **Sanitizes free-text** (`notes`, `comment`, `guestName`) via
   `sanitizeFreeText` before persisting.
5. **Returns generic errors** — all `catch` blocks return `"Bad request"` with
   no internal detail exposed.

### 5. `sanitizeFreeText` (`src/lib/sanitize.ts`)

Strips `<script>…</script>` blocks, all remaining HTML tags, and
`javascript:` protocol strings; trims and truncates to `maxLength` (default
2000). Operates server-side before persistence. React's JSX escaping is the
defence-in-depth layer at render time.

### 6. `checkOrigin` (`src/lib/csrf.ts`)

Compares the `Origin` request header against the request host plus
`NEXT_PUBLIC_APP_URL`. Rules:

- No `Origin` header → allowed (server-to-server / curl / Postman).
- Empty `Origin` → rejected.
- Origin matches host or app URL → allowed.
- Otherwise → rejected.

Localhost origins are always allowed for local development.

---

## Redis dependency

No Redis instance is required for the build or for local development.
The in-memory adapter is the automatic fallback. The Redis adapter is active
only when `REDIS_URL` is set, and its package (`redis`) is dynamically imported
so the build succeeds without it installed.

**Production requirement:** `REDIS_URL` must be set to a shared Redis instance
(e.g. Upstash for Track A/Neon, domestic Redis for Track B) before running
multiple app instances. A single-instance deployment without `REDIS_URL` will
function correctly but will not share rate-limit state across restarts.

---

## Consequences

- All three public POST routes are rate-limited and origin-checked.
- Login is locked after 5 failed attempts per email per 5-minute window.
- Free-text fields are sanitized before reaching the database.
- All public route error responses are generic; no internal detail is surfaced.
- The app builds and runs without Redis — `REDIS_URL` is optional for dev.

---

## Rejected alternatives

- **Full CSRF token scheme (double-submit cookie):** `SameSite: lax` on the
  admin session cookie already covers admin mutation CSRF. For public APIs
  (no session cookie) an origin check is the appropriate lightweight layer.
- **Upstash-only Redis client (`@upstash/ratelimit`):** would lock the stack
  to Upstash. The plain `redis` package works with any Redis-compatible server,
  which is required for Track B (domestic).
- **Immediate account lock on first failure:** 5-attempt window is the standard
  balance between security and usability for a restaurant-staff login form.
