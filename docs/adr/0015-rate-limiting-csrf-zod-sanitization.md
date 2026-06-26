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
| `adminAction` | `admin:<userId>` | 60 s | 120 |
| `login` | `login:<email>` | 5 min | 5 |

### 3. Admin action rate limiting (`src/lib/admin-rate-limit.ts`)

Every authenticated admin mutation (menu, orders, tables, settings) calls
`checkAdminActionLimit(session.id)` immediately after role verification.  This
function calls `getLimiter("adminAction").check("admin:<userId>")` and throws
`"Too many requests"` if the limit is exceeded, preventing the DB write.  The
check is placed inside each file's shared auth helper (`assertVendorAccess`,
`scopedOrder`, `requireOwnedTable`) so it cannot be accidentally bypassed when
new public exports are added to those files.

### 4. Login lockout (`src/app/[locale]/admin/actions.ts`)

Before password verification, `login` calls `loginLimiter.check("login:<email>")`.
If the account key is exhausted, it returns `{ errorKey: "tooManyAttempts" }`
without revealing whether the account exists. On successful login the counter is
reset via `loginLimiter.reset(...)` so a legitimate user who previously failed
is not permanently locked.

### 5. Public POST route hardening

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

### 6. `sanitizeFreeText` (`src/lib/sanitize.ts`)

Strips `<script>…</script>` blocks, all remaining HTML tags, and
`javascript:` protocol strings; trims and truncates to `maxLength` (default
2000). Operates server-side before persistence. React's JSX escaping is the
defence-in-depth layer at render time.

### 7. `checkOrigin` (`src/lib/csrf.ts`)

Compares the `Origin` request header against the request host plus
`NEXT_PUBLIC_APP_URL`. Rules:

- No `Origin` header → allowed (server-to-server / curl / Postman).
- Empty `Origin` → rejected.
- Origin matches host or app URL → allowed.
- Otherwise → rejected.

Localhost origins are always allowed for local development.

---

## Trust boundaries and known caveats

### `x-forwarded-for` IP extraction (public API rate limiting)

Public routes extract the client IP from
`x-forwarded-for[0]` (the first entry in the comma-separated list).  This
header is client-controlled on a raw TCP connection and can be spoofed by
anyone who can reach the origin directly.

**On Vercel (production):** Vercel's edge layer appends the true client IP as
the last entry in `x-forwarded-for` and also populates `x-real-ip`.  The
`x-forwarded-for[0]` value originates from whatever the client sent and is
therefore untrusted.  A determined attacker who can route directly to the
origin function could rotate this value to bypass the rate limit.  Mitigation
options in order of preference:

1. Read the platform-trusted `x-real-ip` header instead of `x-forwarded-for[0]`
   (Vercel sets this reliably; Cloudflare uses `cf-connecting-ip`).
2. Use Vercel's Edge Middleware to enforce rate limits before the function is
   reached, where the platform IP is authoritative.

This is a **known acceptable risk** for the current deployment phase: the
in-memory fallback and Redis adapter both operate correctly; a bypass reduces
effective rate limiting to a per-window annoyance rather than a security break
because the downstream DB is still protected by RBAC and server-authoritative
pricing.  The approach is documented here so it is not overlooked before GA.

### `InMemoryRateLimiter` — unbounded `Map`

`InMemoryRateLimiter.store` is a `Map` with no eviction of expired entries.
Keys are only overwritten on the next hit for the same key after the window
expires.  Under a sustained stream of unique IP addresses the map grows without
bound, consuming process memory.  This is acceptable for the **dev/fallback
adapter** because:

- A production deployment with more than one app instance MUST set `REDIS_URL`
  and will use `RedisRateLimiter`.
- Single-instance dev traffic volumes are small enough that this does not
  matter in practice.

A periodic sweep of expired entries could be added if needed; for now the
constraint is documented and production relies on the Redis adapter.

### `getLimiter` — concurrent first-call race

`getLimiter` checks and updates the `cache` Map synchronously, but
`buildRateLimiter` is an async function.  Two concurrent first-calls for the
same limiter name could each call `buildRateLimiter`, creating two Redis
clients (one orphaned).  The impact is a single extra TCP connection per race;
subsequent calls use the cached instance.  Caching the in-flight `Promise`
would eliminate the race entirely but adds complexity not warranted by the
current traffic profile.

### CSRF — `SameSite` cookie dependency

`checkOrigin` allows requests with **no `Origin` header** (server-to-server,
`curl`, Postman).  For browser state-changing routes this means CSRF protection
relies on the browser always sending `Origin` **and** on the admin session
cookie being `SameSite: lax` (or `strict`).  The admin cookie is set with
`SameSite: lax` in `src/lib/auth.ts`; this must remain in place for the CSRF
defence to hold.  Removing `SameSite` from the cookie would make CSRF possible
via cross-origin form submissions (which do not trigger `preflight` and
therefore do not send `Origin`).

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
- All admin mutations (menu, orders, tables, settings) are rate-limited per authenticated user id.
- Login is locked after 5 failed attempts per email per 5-minute window.
- Free-text fields are sanitized before reaching the database.
- All public route error responses are generic; no internal detail is surfaced.
- The app builds and runs without Redis — `REDIS_URL` is optional for dev.
- Trust boundaries for `x-forwarded-for` and `SameSite` cookie dependency are documented above.

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
