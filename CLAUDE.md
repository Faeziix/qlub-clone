# Project: Qlub Iran Clone

## Overview
- **Type**: Next.js web app (QR pay-at-table + restaurant management platform)
- **Stack**: Next.js 16, React 19, TypeScript (strict), Tailwind CSS v3, Prisma, SQLite (dev) / Postgres (prod)
- **Package Manager**: bun (never npm or pnpm)
- **Started**: 2026-06-25

## Architecture Decisions

See `docs/adr/` for full ADRs. Key decisions:

- **ADR-0001** — No committed secrets; `AUTH_SECRET` mandatory; no fallback; no backdoor scripts; hardened seed with crypto-random passwords.
- **ADR-0002** — All table mutations require a valid admin session and vendor-scoped ownership check (IDOR fix).
- **ADR-0003** — bun is the only package manager; Node ≥ 20 pinned via `engines` + `.nvmrc`; `eslint.ignoreDuringBuilds` removed; CI workflow enforces typecheck + lint on PRs.
- **ADR-0014** — Edge middleware fail-closed for `/admin/*`; RBAC via `requireRole`/`assertRole`; 1-hour JWT sessions with DB re-validation on sensitive actions; all admin mutations + logins recorded in `AuditLog`.
- **ADR 0006** — DR baseline: Neon-managed PITR/branching for Track A; restore runbook + RTO/RPO documented; Track B (domestic) DR deferred to Phase 5.
- **ADR 0007** — Review is per-Payment (`paymentId @unique`): each split-bill payer can review once; no orderId on Review.
- **ADR 0008** — Schema modernization: native Postgres enums, JSONB columns, Iran defaults (IRR/fa/Asia/Tehran/ir), translation tables, monotonic per-vendor orderNumber, AuditLog, sub-merchant fields.
- **ADR 0009** — Server-authoritative pricing: re-fetch DB prices at order creation; honored-price rule with `priceChanged` flag; `$transaction` wrapping for all money writes; `initiatePaymentLeg` with TTL reservation; idempotency keys persisted and deduplicated.
- **ADR 0010** — next-intl Farsi-first RTL foundation: `[locale]` path segment; default locale `fa`; `app/[locale]/layout.tsx` sets `<html lang dir>` server-side; middleware handles cookie + Accept-Language; removed 6 dead locales; Vazirmatn font; imperative DOM dir mutations removed.
- **ADR 0011** — Persian formatting deep modules: `toman-formatter.ts` owns Toman display (never IRR Intl style), `digit-normalizer.ts` normalizes both Persian (U+06F0) and Arabic-Indic (U+0660) digit families, `jalali.ts` enforces Asia/Tehran via TZDate, `banking-holidays.ts` provides the static holiday calendar and settlement-day arithmetic.
- **ADR 0019** — Guest phone + SMS OTP: 6-digit CSPRNG code, SHA-256 hash stored (never plaintext), 2-min TTL, 5-attempt cap, per-phone + per-IP Redis rate limits. Two SMS provider adapters behind `SmsProvider` interface + console dev adapter. `SmsUnavailableError` signals graceful degradation (payment proceeds). Operator override via `POST /api/admin/otp-override` (staff+, tenant-isolated, audited). `Vendor.otpGateEnabled` controls the optional pre-fire gate.
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
- Admin routes: `/admin/*` — JWT-guarded via `proxy.ts` (Next 16 convention; nodejs runtime — renamed from the deprecated edge `middleware.ts`).
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
- ❌ Test fixtures for `createOrderFromCart` missing `active: true` on the vendor mock → ✅ Always include `active: true` in vendor stubs because `createOrderFromCart` enforces the suspension check.
- ❌ `bun test` runs bun's native test runner (ignores vitest.config.ts aliases) → ✅ Use `bun run test` to invoke vitest via the package.json script so aliases (including `server-only` stub) apply.
- ❌ Banking-holiday calendar must be updated annually (religious holidays shift ~10 days/year) → ✅ Update `IRANIAN_BANKING_HOLIDAYS` in `banking-holidays.ts` at each Nowruz; see `docs/i18n/banking-holiday-calendar.md`.
- ❌ `provider.request({ amount: leg.amount })` charges only the bill and silently undercharges tipping diners → ✅ Pass `leg.total` (= `amount + tipAmount`) to `provider.request()`; only `payment.amount` (bill portion) credits `order.amountPaid` in `recordPaymentVerified`.
- ❌ Callback route passed `verifyResult.amount ?? payment.amount` to `recordPaymentVerified` without asserting equality with the reserved amount → ✅ Assert `verifyResult.amount === payment.amount + payment.tipAmount` before crediting; treat mismatch as payment failure.
- ❌ `mobile: data.payerName` sent payer NAME as the gateway mobile field → ✅ Omit `mobile` from `provider.request()` until a dedicated `dinerMobile` field is added to the request schema.
- ❌ State machine had no `verifying` intermediate state — concurrent callbacks could both apply `recordPaymentVerified` and double-credit `order.amountPaid` → ✅ `transitionToVerifying` claims the payment atomically (`WHERE status='pending'`); only the first caller gets 1 row; subsequent callers get 0 and return idempotent success.
- ❌ `PaymentStatus` enum missing `verifying` value — adding it after the fact requires `ALTER TYPE ... ADD VALUE` not a full enum recreate in Postgres → ✅ Use `ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'verifying' AFTER 'pending'` in the migration.
- ❌ Ceiling-split tip distribution: proportionally splitting tip by bill chunks can produce gatewayTotal > ceiling → ✅ Split the TOTAL (amount+tip) by ceiling, then derive amount/tip portions from each total chunk proportionally.
- ❌ Next 16 keeps deploying `src/middleware.ts` on the deprecated **edge** runtime, which can throw `MIDDLEWARE_INVOCATION_FAILED` at runtime even when the build passes → ✅ Rename to `src/proxy.ts` with `export default function proxy(...)` (Next 16 convention, **nodejs** runtime). `config.matcher` is unchanged; `jose`/`process.env` run fine on Node; `next-intl/middleware` import path is unchanged.
- ❌ Passing a placeholder-bearing message (e.g. `"No {status} orders right now."`) to a client component via `t("key")` throws `FORMATTING_ERROR: variable X was not provided` — the server resolves ICU at call time but the value is only known on the client → ✅ Use `t.raw("key")` to pass the raw template untouched; the client interpolates with `.replace("{x}", ...)`. Applies to `noFilteredOrders`/`inclTip`/`ceilingSubCharges` (orders), `tableCount_one`/`tableCount_other`/`tableLabelHint`/`deleteConfirmFull` (tables), `noFilteredReviews` (reviews).
- ❌ A clickable row rendered as `<button>` that contains action `<button>`s (OrderRow → OrderActions) produces `<button> cannot be a descendant of <button>` hydration errors → ✅ Make the row a `<div role="button" tabIndex={0}>` with `onClick` + `onKeyDown` (Enter/Space) and `cursor-pointer`; keep `stopPropagation` on the inner actions wrapper.
- ❌ Translation bag keys must exist in every locale or `MISSING_MESSAGE` throws at render (e.g. `admin.dashboard.total` absent in en/fa) → ✅ Keep `messages/en.json` and `messages/fa.json` structurally parallel; add the key to both.
- ❌ Defining `OrderSnapshot` (or similar API-response shapes) locally in both a sheet component and the parent component causes TS2719 "Two different types with this name exist" → ✅ Hoist shared API-response types to `src/lib/types.ts` (`CustomerOrderSnapshot`, `CustomerOrderItem`) and import from there.
- ❌ Calling `setOrder(initialOrder)` synchronously inside `useEffect` triggers `react-hooks/set-state-in-effect` error for new files (only exempted for files in `preExistingEffectSyncComponents`) → ✅ Lift order snapshot state to the parent; child components receive current state as a prop and report updates via an `onOrderRefreshed` callback rather than managing a local copy.
- ❌ Vercel build fails with `P1012 Environment variable not found: DIRECT_URL` during `prisma migrate deploy` even though `prisma generate` passed (generate doesn't resolve datasource `env()`; migrate does) → ✅ Set both `DATABASE_URL` (pooled, `-pooler` host) and `DIRECT_URL` (unpooled, no `-pooler`) in Vercel env for Production/Preview. `prisma.config.ts` only loads a local `.env`, so Vercel needs them in project settings.
- ❌ `localeDetection: true` in `src/i18n/routing.ts` causes next-intl to redirect `/qr/ir/<slug>` to `/en/qr/ir/<slug>` for English-browser users, breaking the Farsi-first mandate → ✅ Set `localeDetection: false` so the default locale (fa) is always served unless the user explicitly navigates to `/en/...`.
- ❌ Category chip buttons rendered `{c.name}` (DB default) instead of `{localizedName(c, lang)}`, showing Farsi names even in English mode → ✅ All displayed names in customer UI must use `localizedName(node, lang)` so the active locale's translation is shown.
- ❌ i18n keys used in `MenuExperience` (`back`, `language`, `noSearchResults`) existed only in `messages/*.json` (next-intl admin files) but NOT in the `en`/`fa` dicts in `src/lib/i18n.ts` used by `makeT()` → ✅ Always add keys to `src/lib/i18n.ts` dicts when used by customer-facing components that call `makeT()`; `messages/*.json` is a separate namespace for next-intl admin routes.
- ❌ Inline modifier groups in seed.ts (not reusing the shared top-level consts) were added without `faName` on the group or any options, so `localizedName()` fell back to English for those groups/options → ✅ Every inline `modifierGroups` entry and every `options` entry needs `faName` alongside `name`; audit all non-const inline groups in seed.ts when adding new items.
- ❌ Hardcoded `z-[200]`/`z-[300]` in component className bypasses the design token system → ✅ Use the Tailwind token aliases `z-overlay` (= var(--z-overlay) = 200) and `z-modal` (= var(--z-modal) = 300) defined in tailwind.config.ts.
- ❌ `h-5 w-5 rounded-md` (border-radius 6px) on a 20×20px indicator still reads as a circle to users → ✅ Use `rounded` (4px) for multi-select checkbox indicators so the circular vs square affordance is clearly distinct from `rounded-full` radio buttons.
- ❌ `AND status = ANY(${array})` in `$queryRaw` fails on Postgres with error 42883 when `status` is a native enum column and the array is a JS string array (Prisma binds it as `text[]`) → ✅ Cast the column: `AND status::text = ANY(${array})`.
- ❌ Zustand `persist` with a custom bigint reviver only converts `__bigint__`-tagged strings; plain numeric values left in stale localStorage (from before the replacer was added) pass through as `number`, causing `Cannot mix BigInt and other types` when `lineTotal()` does `0n + number` → ✅ Add `onRehydrateStorage` callback to the persist options that re-normalises all BigInt fields with `BigInt(value)` (safe because `BigInt(bigint)` is a no-op).
- ❌ `recomputeOrderTotals` computed service charge and tax on the raw subtotal instead of `subtotal - discount`, diverging from `computeBill` → ✅ Pass `orderRow.discount` as the fifth argument; compute `taxable = max(0, subtotal - discount)` before applying rates.
- ❌ English locale i18n key `myOrderTitle` was set to the Persian string `"سفارش من"` instead of `"My Order"`, so English-language users see a Persian sheet title → ✅ Keep all locale dicts structurally parallel; English keys must contain English strings.
- ❌ `rialDisplay` in `MyOrderSheet.tsx` performed inline `r / 10n` + `"Toman"` for English, bypassing the named money-display boundary → ✅ Add `formatRialAsTomanLatin` to `toman-formatter.ts` and call it from both locale branches of `rialDisplay`.
- ❌ `appendToExistingOrder` catch block used `e.message` (axios generic "Request failed with status code 4xx") to build the user-visible error, so Farsi users always saw the English axios error string → ✅ Extract `e.response?.data?.error` via `axios.isAxiosError(e)` and pass the server message to `localizedAppendError` which maps to the correct locale string.
- ❌ `SimulatedPaymentAdapter` was created fresh on every `getPaymentProvider()` call so verify() in the callback always saw an empty sessions Map → ✅ Make the simulated adapter a module-level singleton in `factory.ts`; add `resetPaymentProviderForTesting()` for test isolation.
- ❌ `PaymentFlow.tsx` used a fake `setTimeout(1200)` then unconditionally showed success — IPG method never triggered a gateway redirect → ✅ Call `/api/payments` with axios; check `data.gatewayRedirectUrl` and for `method === "ipg"`, set state `pendingGatewayUrl` then let a `useEffect` assign `window.location.href` (direct assignment in render body triggers `react-compiler` error "This value cannot be modified").
- ❌ `window.location.href = url` inside a component event handler triggers `eslint-plugin-react-compiler` error "This value cannot be modified. Consider using an effect." → ✅ Store the URL in state (`setPendingGatewayUrl`) and assign in a `useEffect` that depends on it.
- ❌ Payment callback routes redirected to `/payment/success` etc. but those pages did not exist → ✅ Create `app/[locale]/payment/success`, `app/[locale]/payment/failed`, `app/[locale]/payment/pending` pages; the `as-needed` next-intl prefix means `/payment/success` routes to `[locale]/payment/success` with `locale="fa"`.
- ❌ `SimulatedPaymentAdapter.redirectUrl()` pointed to external `sandbox.shaparak.test` which is unreachable in dev → ✅ Derive `origin` from the stored `callbackUrl` in the session and return `${origin}/dev/payment-sim/${ref}`; add `GET /api/dev/simulate-payment?ref=&action=paid|cancelled` to trigger the callback flow.
- ❌ Payment success page passed `order.total` and full line items to the receipt, so a diner who only paid their split share (30,000 T of 222,200 T) saw the WHOLE bill marked "Paid" → ✅ Callback route now passes `paymentId` in the success redirect URL; `page.tsx` loads the specific payment leg and detects split via `payment.amount + payment.tipAmount < order.total`; `ReceiptDisplay` renders a minimal `SplitReceiptCard` showing only the leg total (bill + tip) with a "Your share" label and Split icon, never the full order breakdown.
- ❌ `AdminSidebar` showed the desktop sidebar via a single `fixed` aside with `lg:translate-x-0` + closed-state `rtl:translate-x-full`; on RTL (Farsi) desktop the `rtl:` utility is emitted after `lg:` in the compiled CSS so it wins, pushing the sidebar 100% off the right edge (invisible — only the empty `lg:ps-72` gutter showed) while LTR worked → ✅ Don't rely on a fragile responsive+RTL transform for the desktop sidebar. Split into a static in-flow desktop aside (`sticky top-0 h-screen hidden lg:flex w-72 shrink-0`, no transform) plus a separate `fixed lg:hidden` mobile slide-over drawer; both render a shared `SidebarContent`. Make `admin/layout.tsx` a `lg:flex` row with `<main className="min-w-0 flex-1">` (drop `lg:ps-72`). The desktop column can never be translated off-screen, so it's consistent in RTL and LTR across every admin page.
- ❌ Superadmin had a `vendorId=null` first-vendor fallback baked into vendor pages (`menu`, `settings`, `tables`) and shared DB queries (`orders`, `reviews`) — a silent cross-vendor data leak → ✅ Role-gate every vendor page with `if (session.role === "superadmin") redirect("/admin/superadmin"); if (!session.vendorId) redirect("/admin/login")` at the top; remove all `session.vendorId ? ...vendorId : undefined` query fallbacks. Add a matching edge guard in `proxy.ts` (`isVendorAdminPath` + `payload.role === "superadmin"` → redirect to `/admin/superadmin`) so the middleware handles it before the page even runs.
- ❌ Admin sidebar used `lg:flex` / `lg:hidden` so tablet users (768–1023 px) always saw the mobile hamburger header with no persistent sidebar — even though DESIGN.md defines `md` (768 px) as the desktop admin layout breakpoint → ✅ Change `AdminSidebar` and `SuperadminSidebar` to `md:flex` / `md:hidden` and update `admin/layout.tsx` to `md:flex`; the desktop aside is `hidden md:flex w-64 shrink-0`. DESIGN.md updated to document the admin shell layout.
- ❌ Admin filter chips (OrdersBoard, ReviewsList) used `flex flex-wrap` causing multi-row chip bar on mobile — wastes vertical space and looks messy → ✅ Use `overflow-x-auto no-scrollbar flex-nowrap` (+ `shrink-0` on each chip button) so chips scroll horizontally without wrapping.
- ❌ Menu `ItemRow` in `MenuManager` was a single horizontal flex with 5 columns; on mobile (< sm) the thumbnail + name + price + toggle + actions overflowed → ✅ Wrap image+content in a `flex-1` row and move price+toggle+actions into a second `flex items-center justify-between` row; on `sm+` keep the single-row layout via `sm:flex-row sm:gap-4`.
- ❌ `setOrigin(window.location.origin)` inside `useEffect` in `TablesGrid` triggered `react-hooks/set-state-in-effect` lint warning → ✅ Replace with a lazy `useMemo(() => typeof window !== 'undefined' ? window.location.origin : '', [])` — avoids the effect entirely.

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
- `src/lib/queries-active.ts` — `getVendorBySlugActive` — like `getVendorBySlug` but returns null for suspended (active=false) vendors; used by all public customer routes
- `src/app/[locale]/admin/superadmin/actions.ts` — Superadmin server actions: `createTenant`, `suspendTenant`, `reactivateTenant`, `provisionOwner`, `listTenants`, `listPlatformStaff`, `changeStaffRole`, `deactivateStaff`, `reactivateStaff`
- `src/components/customer/SuspendedTenantPage.tsx` — RTL Farsi-first "restaurant suspended" page shown instead of 404/500 for suspended tenants
- `src/app/api/admin/orders/route.ts` — `GET /api/admin/orders` — JWT-authed, tenant-scoped, cursor-paginated order list for the live order board
- `src/app/[locale]/admin/orders/_hooks/useOrdersPolling.ts` — `useOrdersPolling(initialOrders, opts)` — client-side polling hook (axios, 8 s interval, merge-by-id, cursor pagination)
- `src/lib/phone.ts` — `normalizePhoneToE164(rawPhone)` — converts Persian/Arabic-Indic digits + local Iranian format to E.164; throws `PhoneNormalizationError` for invalid numbers
- `src/lib/sms-provider.ts` — `SmsProvider` interface; `ConsoleSmsProvider` (dev, logs code); `buildSmsProvider()` factory (chains primary/fallback HTTP adapters, falls back to console in non-prod, `unavailable` in prod without creds); `resetSmsProviderForTesting()`
- `src/lib/otp.ts` — `requestOtp({ rawPhone, ip })`, `verifyOtp({ rawPhone, code })`; SHA-256 hashed codes; 2-min TTL; 5-attempt cap; per-phone + per-IP Redis rate limits; `InMemoryOtpStorage` (dev fallback); `resetOtpStorageForTesting()` + `resetOtpRateLimitersForTesting()` for tests
- `src/app/api/otp/request/route.ts` — `POST /api/otp/request` — public OTP request endpoint
- `src/app/api/otp/verify/route.ts` — `POST /api/otp/verify` — public OTP verify endpoint; sets `Order.phoneVerifiedAt`
- `src/app/api/admin/otp-override/route.ts` — `POST /api/admin/otp-override` — staff+ operator override; sets `Order.phoneVerifiedAt` + audit log
- `src/lib/payment/provider.ts` — `PaymentProvider` interface + all input/result types (issue #20)
- `src/lib/payment/adapters/simulated.ts` — `SimulatedPaymentAdapter` in-process sandbox (issue #20)
- `src/lib/payment/factory.ts` — `getPaymentProvider()` factory (reads `PAYMENT_PROVIDER` env); module-level singleton for `SimulatedPaymentAdapter` so sessions persist across HTTP requests; `resetPaymentProviderForTesting()` for test isolation
- `src/lib/payment/payment-service.ts` — `transitionToVerifying` (pending→verifying, atomic first-writer-wins), `recordPaymentVerified`, `recordPaymentFailed`, `expirePayment` (guards verifying too), `recordPaymentRefunded` (succeeded→refunded)
- `src/lib/payment/ceiling-split.ts` — `splitIntoSubCharges`, `computeCeilingSplit` (splits bill+tip by IPG ceiling), `areCeilingSplitSubChargesFullyPaid`, `IPG_TRANSACTION_CEILING_RIAL`
- `src/lib/payment/reconciliation-sweep.ts` — `runReconciliationSweep` (DI-based, testable), `buildReconciliationSweepRunner`, `SWEEP_STALENESS_MINUTES`; types: `SweepablePayment`, `OpsQueueEntry`, `ReconciliationSweepInput`
- `src/app/api/payments/callback/route.ts` — `GET /api/payments/callback` — server-side gateway callback handler; uses `transitionToVerifying` before verify for concurrent-safe first-writer-wins claim
- `src/app/api/payments/sweep/route.ts` — `POST /api/payments/sweep` — scheduled reconciliation sweep endpoint (requires `x-sweep-secret`)
- `src/lib/payment/wallet-service.ts` — `issueRefundAsPayout` (float-guarded ledgered payout + sets Payment.status=refunded atomically), `depositFloat` (operator pre-funds wallet), `getWalletBalance`, `getWalletLedger`, `resolveOverpaymentViaRefund` (overpay unwind delegates to issueRefundAsPayout)
- `src/lib/store/active-order.ts` — `useActiveOrder` Zustand store (persisted to localStorage); tracks active open order per vendor slug; `setActiveOrder`, `clearActiveOrder`, `getActiveOrder`
- `src/lib/types.ts` — added `CustomerOrderItem`, `CustomerOrderSnapshot` shared types for client-side order display; used by `MyOrderSheet` and `MenuExperience`
- `src/app/api/orders/[orderId]/route.ts` — `GET /api/orders/[orderId]` (order status polling, rate-limited) + `PATCH /api/orders/[orderId]` (incremental append items, server-authoritative pricing, blocks terminal orders and pending payments)
- `src/components/customer/MyOrderSheet.tsx` — `MyOrderSheet` — bottom sheet showing live order status (with step progress indicator), all items, bill breakdown, Pay bill CTA, Add more items button; polls every 10 s via parent-owned state (`onOrderRefreshed` callback)
- `src/lib/pricing.ts` — added `recomputeOrderTotals` helper for recalculating service charge + tax after appending items to an order
- `src/components/customer/_components/MenuSkeleton.tsx` — `MenuSkeleton` (menu browse shimmer skeleton) and `LandingSkeleton` (landing page shimmer skeleton); used by `loading.tsx` at the vendor menu route
- `src/components/customer/_components/ItemCard.tsx` — redesigned menu item card: brand-gradient image fallback, RTL "+" add indicator, `data-money` price, tabular-nums, diet badges
- `src/components/customer/_components/CategoryChips.tsx` — category chip strip with auto-scroll active chip, `role=tablist`/`aria-selected` a11y, i18n `aria-label`, `localizedName` for Farsi/English display
- `src/components/customer/_components/CartLineItem.tsx` — individual cart line card: item name, modifier list (·-joined), optional notes, quantity stepper (min=0 removes), MoneyText price aligned end
- `src/app/api/dev/simulate-payment/route.ts` — `GET /api/dev/simulate-payment?ref=&action=paid|cancelled` — dev-only endpoint (404 in prod); marks the simulated payment session then redirects to the stored callbackUrl; enables the full dev sandbox IPG flow without a real gateway
- `src/app/[locale]/dev/payment-sim/[ref]/page.tsx` — dev-only simulated gateway UI (404 in prod); shows amount in Toman, ref; Pay / Cancel links that trigger `/api/dev/simulate-payment`; all JSX strings extracted to `UI` const object to satisfy `local/no-raw-jsx-strings`
- `src/app/[locale]/payment/success/` — redesigned receipt + review screen (issue #43): three-step flow (`receipt → review → done`) orchestrated by `PaymentSuccessClient`. `ReceiptDisplay` shows a styled receipt card (vendor name, order number, line items, subtotal/service charge/VAT/tip breakdown, bold total) with "Rate experience" + "Back to menu" CTAs. `ReviewForm` captures overall rating (44 px stars) + sub-ratings for food/service/ambience (22 px stars in a card), optional comment/name, posts to `/api/reviews` via axios. `ThankYouScreen` shows Heart icon + feedback-helps copy after submit. All three components receive `dir` prop and use logical properties for RTL.
- `src/app/[locale]/payment/failed/page.tsx` + `_components/PaymentFailedClient.tsx` — payment failure page: XCircle, Try again (→ `/qr/${country}/${slug}/pay?order=${orderId}`), Back to menu
- `src/app/[locale]/payment/pending/page.tsx` + `_components/PaymentPendingClient.tsx` — pending/concurrent-callback page: Loader2 spinner, polls `/api/orders/${orderId}` every 3 s, redirects to success when paid or to failed after 20 polls (60 s timeout)
- `src/components/admin/SuperadminSidebar.tsx` — `SuperadminSidebar` platform console sidebar; shows only Platform Dashboard / Restaurants / Platform Staff nav; displays "Platform Console" label; distinct from `AdminSidebar` which is vendor-scoped

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

- #27 — Superadmin tenant & owner management console: create/suspend/reactivate vendors, provision owner accounts, platform-wide staff management, suspension guard on customer routes

**Done (M5 issues):**
- #17 — Real-time order board v1: `/api/admin/orders` polling endpoint (cursor pagination, JWT auth, tenant isolation); `useOrdersPolling` hook (axios, 8 s, merge-by-id); RBAC-gated status transitions (staff = workflow only, manager+ = all incl. cancel/paid/open); ceiling-split payment display (parentPaymentId badge)
- #18 — Guest phone + SMS OTP: `phone.ts` E.164 normalizer (Persian/Arabic-Indic → ASCII → E.164); `sms-provider.ts` two-provider chain with console dev adapter; `otp.ts` lifecycle (SHA-256 hash, 2-min TTL, 5-attempt cap, Redis rate limits); `/api/otp/request` + `/api/otp/verify` public routes; `/api/admin/otp-override` staff+ override; schema: `Order.phoneVerifiedAt` + `Vendor.otpGateEnabled`; ADR-0019

**Done (M6 issues):**
- #20 — PaymentProvider interface + simulated/sandbox facilitator: `PaymentProvider` interface (request/redirectUrl/verify/inquire/refundViaPayout/onboardSubMerchant/verifyIban); `SimulatedPaymentAdapter` (in-process sessions, simulatePaid/simulateCancelled test helpers); `getPaymentProvider()` factory (PAYMENT_PROVIDER env, defaults to simulated); `/api/payments/callback` route (server-side verify, never trusts redirect params); `recordPaymentVerified`/`recordPaymentFailed`/`expirePayment` state machine transitions; ADR-0021
- #21 — Payment state machine + idempotency + reconciliation sweep + ceiling-split: `transitionToVerifying` (pending→verifying atomic claim); `recordPaymentRefunded`; `ceiling-split.ts` (`splitIntoSubCharges`, `computeCeilingSplit`, `areCeilingSplitSubChargesFullyPaid`, `IPG_TRANSACTION_CEILING_RIAL`); `reconciliation-sweep.ts` (`runReconciliationSweep`, `buildReconciliationSweepRunner`); `/api/payments/sweep` scheduled sweep endpoint; `verifying` enum value added to `PaymentStatus`; migration 0005; 44 integration tests; ADR-0022
- #23 — Refund-as-payout + platform-wallet ledger + overpayment unwind: `wallet-service.ts` (`issueRefundAsPayout`, `depositFloat`, `getWalletBalance`, `getWalletLedger`, `resolveOverpaymentViaRefund`); `PlatformWallet` + `WalletTransaction` models; `WalletTransactionType` enum; migration 0007; float guard blocks refunds exceeding available balance; overpayment unwind reuses the same path; `PaymentStatus=refunded` driven exclusively by payout record; 19 tests; ADR-0023

**Done (M7 issues):**
- #41 — "My Order" (سفارش من) persistent order + status tracking + incremental re-order: `appendItemsToOrder` (server-authoritative, tenant-isolated, blocks terminal/pending-payment); `recomputeOrderTotals` in `pricing.ts`; `GET/PATCH /api/orders/[orderId]`; `useActiveOrder` Zustand store (persisted to localStorage); `MyOrderSheet` component (status progress bar, item list, bill summary, polling, Pay/AddMore CTAs); incremental cart append in `CartSheet` with "Add to order #{N}" primary action and "New order" secondary option; order status banner in `MenuExperience` landing + menu-browse views; 11 new tests

**Done (M7 issues):**
- #36 — Mobile-first shell + design foundation: `localeDetection: false` (Farsi-default routing fix); category chips now use `localizedName(c, lang)`; missing makeT keys added (`back`, `language`, `noSearchResults`); desktop frame (`md:bg-surface-2` outer + `md:shadow-float` column); `MenuSkeleton` + `LandingSkeleton` shimmer loading components; `loading.tsx` for vendor menu page; `PRODUCT.md` and `DESIGN.md` at repo root; ADR-0024
- #38 — Menu browse + item cards redesign + render freeze fix: `ItemCard` component with image fallback (brand gradient + initial), RTL-aware "+" indicator, `data-money` price attr, tabular-nums; `CategoryChips` with auto-scroll active chip into view, `role=tablist`/`aria-selected`, i18n `aria-label`; `MenuBrowseHeader` extracted; `React.useTransition` for menu switches (non-urgent renders + opacity fade during `isPending`); `React.useDeferredValue` for search query (non-blocking filtering); `requestAnimationFrame` wrapping `scrollIntoView`; menu tabs hidden when only 1 menu; `categoryNav` i18n key added to fa/en dicts
- #40 — Cart redesign + clear-after-placement bug fix: `CartSheet` rewritten with `CartLineItem` component (extracted to `_components/`); `clear()` called in `navigateToPayment` so cart empties immediately on successful order placement; `MoneyText` used for all money display (Persian numerals, tabular-nums, `data-money`); `BillBreakdown` renders subtotal/service/tax rows conditionally + always shows a total row; sticky CTA footer shows loading spinner; error displayed inline above button; empty state with browse-menu CTA
- #42 — Pay screen split/tip UX + /pay reachability + gateway-redirect scaffold: `SimulatedPaymentAdapter` module-level singleton in `factory.ts` (sessions persist across HTTP requests); `SimulatedPaymentAdapter.redirectUrl()` now returns a local `/dev/payment-sim/{ref}` URL derived from `callbackUrl` origin; `GET /api/dev/simulate-payment?ref&action=paid|cancelled` dev endpoint triggers real callback flow; `PaymentFlow.tsx` replaced fake `setTimeout+setStep("success")` with real `axios.post` + `setPendingGatewayUrl` state (assigned via `useEffect` to satisfy react-compiler rule); `/payment/success`, `/payment/failed`, `/payment/pending` pages with locale-aware client components; `PaymentSuccessClient` has embedded star-rating review flow; `PaymentPendingClient` polls every 3 s, times out after 60 s to failed; i18n dict extended with 7 new keys; 13 new tests
- #43 — Receipt + review screen redesign: `/payment/success` decomposed into `ReceiptDisplay` (receipt card with line-item breakdown, totals), `ReviewForm` (overall + sub-ratings, comment/name, axios post to `/api/reviews`), `ThankYouScreen`; `page.tsx` passes item breakdown data (`items`, `subtotal`, `tipAmount`, `serviceCharge`, `tax`); 6 new i18n keys (`overallRating`, `orderSummary`, `paidWith`, `receiptFor`, `leaveReview`, `skipReview`); RTL-aware back button (ChevronRight in RTL, ChevronLeft in LTR). Split-payment receipt fix: callback route now passes `paymentId` in the success redirect URL; `page.tsx` uses `paymentId` to find the specific payment leg and detects split (`payment.amount + payment.tipAmount < order.total`); `ReceiptDisplay` renders `SplitReceiptCard` (Split icon + "your share" label + leg total only) vs `FullReceiptCard` (full line-item breakdown); 2 new i18n keys (`yourShare`, `splitReceiptNote`).

**Done (M8 issues):**
- #45 — Split superadmin from owner: `SuperadminSidebar` component (platform console nav, no vendor items); `admin/layout.tsx` conditionally renders `SuperadminSidebar` for superadmin vs `AdminSidebar` for vendor roles; `login` action redirects superadmin to `/admin/superadmin` on success; `proxy.ts` edge guard redirects superadmin away from vendor routes (`/admin`, `/admin/orders/*`, etc.) at the middleware level; all vendor-specific pages (`orders`, `menu`, `reviews`, `settings`, `tables`, dashboard) have role/vendorId guards that redirect superadmin immediately; all `vendorId = null` first-vendor fallbacks removed; 4 new i18n keys added (`platformConsole`, `platformDashboard`, `tenants`, `platformStaff`) in both fa/en.
- #46 — Platform console redesign: `SuperadminDashboardPage` replaced with rich platform overview (4-stat row: totalTenants/activeTenants/totalStaff/totalOrders; recent-tenants panel with per-row status badge + timeAgo + order/staff counts; quick-action cards + platform-summary breakdown `<dl>`); `TenantTable` redesigned with live client-side search (name/slug/email filter), bordered header row, icon-accented rows, eNamad status badges, accessible action dropdown with backdrop dismiss + icon per action; `StaffTable` redesigned with search + role-filter dropdown, building-icon restaurant cell; 19 new i18n keys in both fa/en (`totalOrders`, `activeTenants`, `recentTenants`, `searchTenants`, `searchStaff`, `filterByRole`, `allRoles`, `viewAll`, `noResults`, `suspendedCount`, `platformOverview`, `quickActions`, `enamadStatus_*`, `noRecentTenants`, `joinedAt`, `createdAt`); all Prisma queries parallelised with `Promise.all`.
- #47 — Vendor admin polish (responsive + design pass): admin sidebar breakpoint changed from `lg` (1024 px) to `md` (768 px) so tablet users see the persistent sidebar; sidebar width standardised to `w-64`; both `AdminSidebar` and `SuperadminSidebar` updated; filter chips in `OrdersBoard` and `ReviewsList` changed from wrapping flex to horizontal-scroll (`overflow-x-auto no-scrollbar`); menu `ItemRow` in `MenuManager` made responsive (2-row stacked on < sm, single-row on sm+); dashboard recent-orders table hides guest/time columns on mobile; `PageHeader` uses responsive font size (`text-xl` → `sm:text-2xl`); `StatCard` adds `truncate` + responsive value size; `TablesGrid` `setOrigin` moved from `useEffect` to `useMemo` (eliminates lint warning); DESIGN.md updated with admin shell layout documentation.
