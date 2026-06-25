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
- ❌ `Float` money columns with `round2` and epsilon comparisons → ✅ `BigInt` integer rial only; conversions only via `money.ts`; exact `isFullyPaid` comparison.
- ❌ `bigint` cannot be JSON-serialized → ✅ Serialize to `String(bigintValue)` at the server/client boundary; convert back with `BigInt(str)` at point of use. Never pass raw `bigint` props to client components.
- ❌ Explicit type parameters on `React.useMemo<bigint>()` block React Compiler → ✅ Let TypeScript infer from the return type; remove explicit type parameter.

## Dependencies & Tooling

- `next@^16.2.9` — App Router, Server Actions, Route Handlers
- `prisma@^6.19.3` — ORM; SQLite for dev, Postgres for prod
- `vitest@^4.1.9` — Test runner
- `eslint-config-next@^16.2.9` — ESLint flat config (v9)
- `tailwindcss@^3.4.19` — Utility CSS with HSL design token system
- `zustand@^5.0.14` — Cart state
- `jose@^5.10.0` — JWT signing/verification
- `zod@^3.25.76` — Input validation on all server actions/routes
- `fast-check@^4.8.0` + `@fast-check/vitest@^0.4.1` — Property-based testing for money round-trip invariants

## Component Registry

- `src/lib/env.ts` — `requireAuthSecret`, `assertServerEnv`, `isDemoSeedingEnabled`
- `src/lib/auth.ts` — JWT session management
- `src/lib/money.ts` — ALL money conversions: `MONETARY_UNIT`, `rialToToman`, `tomanToRial`, `rialToGatewayUnit`, `gatewayUnitToRial`, `formatRialAsToman`, `parseRialFromInput`, `isFullyPaid`
- `src/lib/pricing.ts` — Bill math (VAT, service charge, split, tip) — all `bigint` arithmetic
- `src/lib/orders.ts` — Order/payment/review service layer
- `src/instrumentation.ts` — Boot-time env assertion via `register()`

## API & Data Layer

- Prisma schema: `prisma/schema.prisma` (SQLite in dev, switch provider to `postgresql` for prod)
- Seed: `prisma/seed.ts` — crypto-random passwords, SEED_DEMO gate

## Current State

**Done (M1 + M2 issues):**
- #2 — Repo safety hardening (secrets, backdoors, hardened seed)
- #3 — Tables actions IDOR fix (auth + vendor scoping)
- #4 — Tooling standardisation (bun, Node pin, CI, env example)
- #7 — Integer-rial money model (money.ts deep module + property tests)

**In progress / next:**
- M2 remaining issues on branch `feat/m2-data-money-core`
