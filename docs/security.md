# Security & secrets

This is a real-money product. Treat every secret and credential accordingly.

## Environment variables

- All configuration lives in `.env`, which is **gitignored and must never be
  committed**. Copy `.env.example` to `.env` and fill in real values.
- `AUTH_SECRET` is **required**. The app refuses to start without it
  (`src/lib/env.ts` → `requireAuthSecret`, enforced at boot via
  `src/instrumentation.ts`). There is no hardcoded fallback. Generate one with:

  ```bash
  openssl rand -base64 48
  ```

## Admin sessions (hardened — ADR-0014)

- Sessions are short-lived signed JWTs (`src/lib/auth.ts`) keyed off `AUTH_SECRET`.
- **JWT lifetime: 1 hour** (`SESSION_TTL_SECONDS = 3600`). Cookie `maxAge` matches.
- There is no token-minting utility. Sessions are issued only through the login
  flow after password verification.
- `revalidateSession()` re-fetches the `StaffUser` row from the DB and re-issues
  a fresh JWT. Called on sensitive actions (settings changes). If the user is
  deactivated or deleted, the session is destroyed and the caller redirects to login.

## Edge middleware — fail-closed admin guard

`src/middleware.ts` verifies the admin session JWT at the edge before any
`/admin/*` page renders. Unauthenticated requests are redirected to `/admin/login`.
The login route is the only public admin route. The check composes with the
`next-intl` routing middleware.

See `docs/adr/0014-admin-auth-edge-middleware-rbac-session-hardening-audit-log.md`.

## RBAC

All admin actions enforce a minimum role requirement via `requireRole(minimum)` /
`assertRole(session, minimum)` (`src/lib/rbac.ts`).

| Action | Minimum role |
|---|---|
| Update order status, cancel order | `staff` |
| Table management, menu mutations | `manager` |
| Vendor settings | `owner` |

Staff accounts cannot reach settings, menu edits, or table management.
See `docs/adr/0014-*` for the full role matrix.

## Audit log

All admin mutations and logins are recorded in `AuditLog` via `recordAuditEvent`
(`src/lib/audit.ts`). Fields: `actorId`, `vendorId`, `action`, `entity`,
`entityId`, `before`, `after`, `at`.

## Demo accounts

- Demo staff accounts are created only by the seed (`prisma/seed.ts`), each with
  a **unique cryptographically-random password** printed once to the seed
  output. There is no shared/static password.
- The login page lists demo accounts only when `isDemoSeedingEnabled()` is true,
  i.e. `NODE_ENV !== "production"` **and** `SEED_DEMO=true`. Never set
  `SEED_DEMO` in production.
- Table QR passcodes are cryptographically random (`crypto.randomInt`).

## Tenant isolation — table mutations

All table mutations (`createTable`, `updateTableStatus`, `deleteTable`) require a
valid admin session and verify that the target table belongs to the caller's
vendor. Superadmins (`vendorId null`) may touch any vendor. A scoped admin
attempting to mutate another vendor's table receives `Forbidden: table belongs to
another vendor.` and no database read or write occurs for the target.

This closes the IDOR identified in PRD §3.2 / user story 31. See
`docs/adr/0002-tables-actions-idor-fix.md` for the full decision record.

`tests/tables-actions-idor.test.ts` enforces this invariant: unauthenticated
calls, cross-vendor writes, and authorised own-vendor writes are all tested.

## Rate limiting, login lockout, and abuse controls (ADR-0015)

### Rate limiters

Three named limiters are configured in `src/lib/limiters.ts`:

| Limiter | Applies to | Key | Window | Max |
|---|---|---|---|---|
| `publicApi` | `/api/orders`, `/api/payments`, `/api/reviews` | `<route>:<ip>` | 60 s | 60 req |
| `adminAction` | (reserved for future use) | `admin:<userId>` | 60 s | 120 req |
| `login` | Admin login action | `login:<email>` | 5 min | 5 attempts |

Two adapters are available (`src/lib/rate-limiter.ts`):

- **`InMemoryRateLimiter`** — default when `REDIS_URL` is absent; process-local,
  not shared across instances.
- **`RedisRateLimiter`** — active when `REDIS_URL` is set; shared across all
  instances and survives restarts. **Production MUST use this.**

### Login lockout

Admin login checks the per-email rate limit before touching the database. After
5 failed attempts in a 5-minute window the login action returns
`{ errorKey: "tooManyAttempts" }` without revealing whether the account exists.
On success the counter is reset so a legitimate user is not permanently locked.

### CSRF / origin checks

All public POST routes (`/api/orders`, `/api/payments`, `/api/reviews`) verify
the `Origin` request header against the request host and `NEXT_PUBLIC_APP_URL`
via `checkOrigin(req)` (`src/lib/csrf.ts`). Cross-origin requests are rejected
with a generic `400` response. Requests with no `Origin` header are allowed
(server-to-server / curl).

### Free-text sanitization

`sanitizeFreeText` (`src/lib/sanitize.ts`) strips `<script>` blocks, all HTML
tags, and `javascript:` URLs from user-supplied strings (`notes`, `comment`,
`guestName`) before persistence. Applied server-side in all three public API
routes. React JSX escaping is the defence-in-depth layer at render time.

### Generic error responses

All `catch` blocks in the three public API routes return `"Bad request"` with no
internal detail (no Prisma error messages, no stack traces, no entity names).

See `docs/adr/0015-rate-limiting-csrf-zod-sanitization.md` for the full record.

## Regression guard

`tests/repo-safety.test.ts` fails if a committed `.env`, the `mint-token`
backdoor, a hardcoded auth-secret fallback, pre-filled login credentials, or the
string `password123` is ever reintroduced. See `docs/adr/0001-repo-safety-hardening.md`.
