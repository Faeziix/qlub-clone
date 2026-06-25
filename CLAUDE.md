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
- **ADR 0006** — DR baseline: Neon-managed PITR/branching for Track A; restore runbook + RTO/RPO documented; Track B (domestic) DR deferred to Phase 5.
- **ADR 0007** — Review is per-Payment (`paymentId @unique`): each split-bill payer can review once; no orderId on Review.
- **ADR 0008** — Schema modernization: native Postgres enums, JSONB columns, Iran defaults (IRR/fa/Asia/Tehran/ir), translation tables, monotonic per-vendor orderNumber, AuditLog, sub-merchant fields.
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
- `src/lib/auth.ts` — JWT session management
- `src/lib/pricing.ts` — Bill math (VAT, service charge, split, tip)
- `src/lib/orders.ts` — Order/payment/review service layer
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

**In progress / next:**
- M2 remaining: #9 (server-authoritative pricing)
