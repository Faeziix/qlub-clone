# Project: Qlub Iran Clone

## Overview
- **Type**: Next.js web app (QR pay-at-table + restaurant management platform)
- **Stack**: Next.js 16, React 19, TypeScript (strict), Tailwind CSS v3, Prisma, SQLite (dev) / Postgres (prod)
- **Package Manager**: bun (never npm or pnpm)
- **Started**: 2026-06-25

## Architecture Decisions

See `docs/adr/` for full ADRs. Key decisions:

- **ADR 0001** — No committed secrets; `AUTH_SECRET` mandatory; no fallback; no backdoor scripts; hardened seed with crypto-random passwords.
- **ADR 0002** — All table mutations require a valid admin session and vendor-scoped ownership check (IDOR fix).
- **ADR 0003** — bun is the only package manager; Node ≥ 20 pinned via `engines` + `.nvmrc`; `eslint.ignoreDuringBuilds` removed; CI workflow enforces typecheck + lint on PRs.
- **ADR 0014** — Edge middleware fail-closed for `/admin/*`; RBAC via `requireRole`/`assertRole`; 1-hour JWT sessions with DB re-validation on sensitive actions; all admin mutations + logins recorded in `AuditLog`.
- **ADR 0006** — DR baseline: Neon-managed PITR/branching for Track A; restore runbook + RTO/RPO documented; Track B (domestic) DR deferred to Phase 5.
- **ADR 0007** — Review is per-Payment (`paymentId @unique`): each split-bill payer can review once; no orderId on Review.
- **ADR 0008** — Schema modernization: native Postgres enums, JSONB columns, Iran defaults (IRR/fa/Asia/Tehran/ir), translation tables, monotonic per-vendor orderNumber, AuditLog, sub-merchant fields.
- **ADR 0009** — Server-authoritative pricing: re-fetch DB prices at order creation; honored-price rule with `priceChanged` flag; `$transaction` wrapping for all money writes; `initiatePaymentLeg` with TTL reservation; idempotency keys persisted and deduplicated.
- **ADR 0010** — next-intl Farsi-first RTL foundation: `[locale]` path segment; default locale `fa`; `app/[locale]/layout.tsx` sets `<html lang dir>` server-side; middleware handles cookie + Accept-Language; removed 6 dead locales; Vazirmatn font; imperative DOM dir mutations removed.
- **ADR 0011** — Persian formatting deep modules: `toman-formatter.ts` owns Toman display (never IRR Intl style), `digit-normalizer.ts` normalizes both Persian (U+06F0) and Arabic-Indic (U+0660) digit families, `jalali.ts` enforces Asia/Tehran via TZDate, `banking-holidays.ts` provides the static holiday calendar and settlement-day arithmetic.
- **Dual-track architecture** — Track A (Vercel + Neon, synthetic data only, separate repo/brand) vs Track B (domestic Iran infra, production). See PRD issue #1.
- **Integer-rial money** — All monetary values are BigInt rial with no floats. Conversion only via `money.ts` at named boundaries.
- **Server-authoritative pricing** — Bill computed from DB prices at order creation, snapshotted onto `OrderItem`. Payment verifies against the snapshot.
- **Tenant isolation** — Every mutation is vendor-scoped. Cross-vendor access is a P0 security defect.

## Preferences & Rules

- **bun only** — Never use npm, pnpm, or yarn. Use `bun install`, `bun run <script>`, `bunx <binary>`.
- **No hardcoded values** — Always use design tokens and env vars. Never hardcode secrets, colors, or money amounts.
- **No floats for money** — Integer rial via `money.ts`. No `round2`, no epsilon comparisons.
- **Farsi-first / RTL** — Persian is the default locale. Use logical CSS properties (`ms/me`, `ps/pe`, `start/end`). No LTR flash.
- **Locality of behavior** — Feature code goes in `_components`, `_hooks`, `_lib`, `_types` inside the route directory. Only truly shared code goes in root-level directories.
- **axios not fetch** — For client-side HTTP requests use axios.
- **CVA + shadcn** — Use class-variance-authority for primitive components. Use shadcn/ui as the component library.
- **Expressive names over comments** — Avoid comments; use descriptive function and variable names instead.
- **No `overflow: hidden` on sticky-positioned elements** — It breaks sticky positioning.
- **No ambient glow for decoration** — Avoid decorative glow effects.
- **Context7 for library docs** — Always use context7 MCP when writing code that uses a library or framework.

## Patterns & Conventions

- Route: `/qr/[country]/[vendor]` — `country` is fixed to `ir` in production.
- Admin routes: `/admin/*` — edge JWT-guarded via `middleware.ts`.
- Server actions: always include auth check + vendor ownership verification.
- Prisma: use `$transaction` + `SELECT … FOR UPDATE` for concurrent money operations.
- Tests: assert external behavior (inputs → outputs/state), not implementation details.

## Learnings & Corrections

- ❌ `eslint.ignoreDuringBuilds: true` silently skips lint → ✅ Remove this flag; ESLint must pass.
- ❌ `pnpm` in README/scripts despite `bun.lockb` → ✅ bun everywhere, no exceptions.
- ❌ Stale `.next/types/` directory causes spurious typecheck errors after moving routes → ✅ `rm -rf .next` before running `tsc --noEmit` when routes have moved.
- ❌ Moving `app/admin` to `app/[locale]/admin` breaks all imports referencing `@/app/admin/*` → ✅ Run `sed -i 's|"@/app/admin/|"@/app/[locale]/admin/|g'` on src files after the move, and update path-based test fixtures too.
- ❌ Imperative `document.documentElement.setAttribute("dir", ...)` in `useEffect` causes visible RTL flash → ✅ Set `dir` server-side on `<html>` in `[locale]/layout.tsx`; remove the imperative mutation entirely.
- ❌ No `.nvmrc` or `engines` field → ✅ Both required for Node version pinning.
- ❌ Incomplete `.env.example` missing `DIRECT_URL` → ✅ Document every required env var with comments.
- ❌ `prisma migrate dev --create-only` blocks with drift prompt on an existing DB → ✅ Use `prisma migrate diff --from-empty --to-schema-datamodel --script` to generate baseline SQL, then `prisma migrate resolve --applied <name>` to mark it applied.
- ❌ `require()` inside test files causes `@typescript-eslint/no-require-imports` lint error → ✅ Use top-level ES import for all node:fs/path functions.
- ❌ Prisma BigInt fields (`price`, `priceDelta`, `total`, etc.) are not assignable to `number` in TS → ✅ Convert at the server→client boundary using `Number()` in query wrapper functions (`getVendorBySlug`, `getItem`, `getOrder`); pass `number` to all client components.
- ❌ `migration_lock.toml` must be committed alongside `prisma/migrations/` → ✅ Always commit `migration_lock.toml` with `provider = "postgresql"` when using a migrations workflow.
- ❌ `prisma db push --force-reset` mixes push-based and migrations-based workflows → ✅ Use `prisma migrate reset --force` for local dev resets when the project uses a migrations workflow.
- ❌ `Review` model has no `orderId` field; it links via `paymentId` → ✅ `createReview` accepts `paymentId`; the review API schema uses `paymentId`; the UI passes `paymentId` captured from the payment response.
- ❌ `PaymentMethod` UI enum ("card", "apple_pay"...) diverges from DB enum ("ipg", "cash") → ✅ Use a local `UiPaymentMethod` type in `PaymentFlow.tsx`; align the Zod schema in the API route with the DB enum.
- ❌ `Date.now()` orderNumber generation is non-monotonic and collision-prone → ✅ Use `nextVendorOrderNumber(vendorId)` which atomically increments `vendorOrderSeq` via `UPDATE ... RETURNING`.
- ❌ Seed used UAE/AED defaults instead of Iran/IRR → ✅ Seed vendors use `country:"ir"`, `currency:"IRR"`, `locale:"fa"`, `timezone:"Asia/Tehran"`, `supportedLangs:["fa","en"]`.
- ❌ Seed passed `JSON.stringify(array)` for JSONB columns → ✅ Pass native JS arrays/objects directly; Prisma serializes them to JSONB.
- ❌ `createOrderFromCart` trusted client `unitPrice`/`priceDelta` → ✅ Always re-fetch from DB via `resolveLinePricesFromDb`; client values are never used for money.
- ❌ Order/payment writes were non-transactional → ✅ `createOrderFromCart`, `recordPayment`, and `initiatePaymentLeg` all use `db.$transaction`.
- ❌ `nextVendorOrderNumber` used `db.$queryRaw` directly → ✅ Accepts a transaction client `tx` so the increment is atomic within the order creation transaction.
- ❌ `createOrderFromCart` returned the order directly → ✅ Returns `{ order, priceChanged }` tuple; update all callers to destructure.
- ❌ `server-only` import in utility modules (`rbac.ts`, `audit.ts`) breaks vitest because the real module is imported (not mocked) and the `server-only` package throws outside Next.js bundler → ✅ Only use `server-only` in modules that Next.js directly bundles and that are always mocked in tests (e.g., `auth.ts`, `db.ts`); omit it from domain helper utilities.
- ❌ Using `requireSession` (no RBAC) in sensitive server actions → ✅ Replace with `requireRole(minimum)` from `src/lib/rbac.ts` to enforce role hierarchy at the action level.
- ❌ `new TZDate(Date | number, tz)` does not work — TS overloads require `Date` or `number` separately → ✅ Use a conditional branch: `typeof date === "number" ? new TZDate(date, tz) : new TZDate(date, tz)`
- ❌ `Intl.NumberFormat` with `style: 'currency', currency: 'IRR'` renders incorrectly for Iranian users → ✅ Use `toman-formatter.ts` exclusively; never IRR currency style.
- ❌ Banking-holiday calendar must be updated annually (religious holidays shift ~10 days/year) → ✅ Update `IRANIAN_BANKING_HOLIDAYS` in `banking-holidays.ts` at each Nowruz; see `docs/i18n/banking-holiday-calendar.md`.

## Dependencies & Tooling

- `next@^16.2.9` — App Router, Server Actions, Route Handlers
- `prisma@^6.19.3` — ORM; SQLite for dev, Postgres for prod
- `vitest@^4.1.9` — Test runner
- `eslint-config-next@^16.2.9` — ESLint flat config (v9)
- `tailwindcss@^3.4.19` — Utility CSS with HSL design token system
- `zustand@^5.0.14` — Cart state
- `jose@^5.10.0` — JWT signing/verification
- `zod@^3.25.76` — Input validation on all server actions/routes

## Component Registry

- `src/lib/env.ts` — `requireAuthSecret`, `assertServerEnv`, `isDemoSeedingEnabled`
- `src/lib/auth.ts` — JWT session management, `createSession`, `getSession`, `destroySession`, `revalidateSession` (DB re-validation + fresh JWT)
- `src/lib/rbac.ts` — RBAC: `ROLE_HIERARCHY`, `assertRole(session, minimum)`, `requireRole(minimum)` (async, redirects if no session)
- `src/lib/audit.ts` — `recordAuditEvent(params)` — writes to `AuditLog`
- `src/lib/pricing.ts` — Bill math (VAT, service charge, split, tip)
- `src/lib/orders.ts` — `createOrderFromCart` (server-authoritative, returns `{order, priceChanged}`), `initiatePaymentLeg` (pending reservation with TTL), `recordPayment` (idempotent, transactional), `createReview`
- `src/lib/toman-formatter.ts` — Persian toman display: `formatRialAsTomanPersian`, `formatTomanAmountPersian`, `latinDigitsToPersian`, `persianDigitsToLatin`, `TOMAN_HEZAR_THRESHOLD_RIAL`
- `src/lib/digit-normalizer.ts` — Digit normalization: `normalizeDigits`, `normalizePhoneForValidation`, `isPersianDigit`, `isArabicIndicDigit`
- `src/lib/jalali.ts` — Jalali dates in Tehran: `toTehranDate`, `getJalaliParts`, `formatJalaliDate`, `formatJalaliDateTime`, `isTehranFriday`, `isTehranThursday`, `addDaysTehran`
- `src/lib/banking-holidays.ts` — Iranian banking holidays: `isBankingHoliday`, `isIranianWeekend`, `isOfficialHoliday`, `nextBankingDay`, `addBankingDays`, `settlementDueDate`, `IRANIAN_BANKING_HOLIDAYS`
- `src/lib/rate-limiter.ts` — `RateLimiter` interface; `InMemoryRateLimiter` (default, dev); `RedisRateLimiter` (production, when `REDIS_URL` set); `buildRateLimiter(options)` factory
- `src/lib/limiters.ts` — Singleton limiter instances: `getLimiter("publicApi" | "adminAction" | "login")`
- `src/lib/sanitize.ts` — `sanitizeFreeText(input, maxLength?)` — strips script/HTML/javascript: from free-text fields
- `src/lib/csrf.ts` — `checkOrigin(request)` — CSRF/origin check for public POST routes
- `src/lib/table-token.ts` — `cryptoPasscode()` (crypto-secure 4-digit passcode); `signTableToken({ vendorId, tableId }, opts?)` (HMAC-SHA256 JWS); `verifyTableToken(token)` (returns payload or null)
- `src/app/api/qr/route.ts` — `GET /api/qr?data=<url>&size=<px>` — server-side QR PNG generation via `qrcode` lib, no external service
- `src/instrumentation.ts` — Boot-time env assertion via `register()`

## API & Data Layer

- Prisma schema: `prisma/schema.prisma` (SQLite in dev, switch provider to `postgresql` for prod)
- Seed: `prisma/seed.ts` — crypto-random passwords, SEED_DEMO gate

## Current State

**Done (M1 issues):**
- #2 — Repo safety hardening (secrets, backdoors, hardened seed)
- #3 — Tables actions IDOR fix (auth + vendor scoping)
- #4 — Tooling standardisation (bun, Node pin, CI, env example)

**Done (M2 issues):**
- #6 — Postgres migration + DR baseline (done on `feat/m2-data-money-core`)
- #7 — Integer-rial money model (BigInt, money.ts, property tests)
- #8 — Schema modernization (enums, JSONB, Iran defaults, translations, orderNumber seq, AuditLog, sub-merchant fields)

- #9 — Server-authoritative pricing + honored-price rule + concurrency + idempotency

**Done (M3 issues):**
- #10 — next-intl Farsi-first RTL foundation: `[locale]` segment, server-side `<html lang dir>`, middleware, fa/en only
- #11 — Persian formatting deep modules: toman-formatter, digit-normalizer, jalali, banking-holidays

**Done (M4 issues):**
- #14 — Admin auth: edge middleware, RBAC, session hardening, audit log

- #15 — Abuse controls: rate limiting (Redis + in-memory), login lockout, zod validation hardening, free-text sanitization, CSRF/origin checks, generic error responses

- #16 — Self-hosted QR (`/api/qr`, `qrcode` lib, no third-party service); crypto passcodes (`crypto.getRandomValues`); signed table tokens (HMAC-SHA256 JWS embedding `vendorId`+`tableId`); guest entry validates + rejects tampered/foreign tokens

**In progress / next:**
- M4 complete — no remaining issues
