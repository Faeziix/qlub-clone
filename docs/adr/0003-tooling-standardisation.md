# ADR 0003 — Tooling standardisation: bun, Node pin, CI typecheck/lint, env example

- Status: Accepted
- Date: 2026-06-25
- Issue: #4 (parent PRD #1, §13 DevOps / CI/CD)

## Context

The repository arrived with several tooling inconsistencies that must be resolved before it scales to a team or a real-money product:

1. **pnpm/bun mismatch.** `bun.lockb` was present (indicating bun was used to install deps), but the README quick-start instructions used `npm` terminology and the setup/seed scripts already used `bun run`. The `.npmrc` file was bun-style but its presence was legacy. No explicit rule existed enforcing bun as the sole package manager.

2. **No Node version pin.** Nothing in the repo declared which Node version was required, making CI/CD setups and local environments inconsistent.

3. **`eslint.ignoreDuringBuilds: true`.** The Next.js config silently skipped ESLint during builds, meaning lint regressions would never be caught. ADR 0001 noted this needed to be removed as part of making lint a real gate.

4. **No CI workflow.** Typecheck and lint had to be run manually; there was no automated enforcement on pull requests.

5. **Incomplete `.env.example`.** The file listed only `DATABASE_URL` and `AUTH_SECRET`, missing `DIRECT_URL` (needed for pooled Postgres in production) and `NEXT_PUBLIC_APP_NAME`.

6. **README stated Next.js 15.** The installed version is Next.js 16.

## Decision

1. **bun is the only package manager.** `package.json` does not call `npm` or `pnpm` anywhere. `engines.bun: ">=1.0"` is added alongside `engines.node: ">=20"` to make the constraint machine-readable.

2. **Node ≥ 20 is pinned** via `engines.node: ">=20"` in `package.json` and a `.nvmrc` file containing `20` at the repo root.

3. **`eslint.ignoreDuringBuilds` is removed** from `next.config.mjs`. ESLint must pass (zero errors) for a production build to be valid. Pre-existing warnings in the three scoped-waiver files (documented in ADR 0001) remain `warn` only and do not block CI.

4. **A CI workflow** (`.github/workflows/ci.yml`) runs on every pull request and push to `main`, running two jobs:
   - `typecheck-and-lint`: `bun run typecheck` + `bun run lint`
   - `test`: `bun run test`
   Both jobs use `oven-sh/setup-bun@v2` and read the Node version from `.nvmrc` via `actions/setup-node`.

5. **`.env.example` is extended** to document `DIRECT_URL` (with an explanatory comment about when it is needed for PgBouncer/Neon pooler) and `NEXT_PUBLIC_APP_NAME`, and to clarify the SQLite vs Postgres usage for each URL variable.

6. **README is updated** to reflect Next.js 16, bun as the package manager, the `engines` constraint, and a note about the CI gate.

## Consequences

- Developers who rely on `nvm use` or `fnm use` get the correct Node version automatically.
- Pull requests that introduce typecheck errors or ESLint errors are blocked by CI before review.
- The `eslint.ignoreDuringBuilds` removal means lint failures that were previously hidden during local `next build` runs will now surface. This is intentional.
- The `.env.example` change is non-breaking; existing `.env` files are unaffected. Developers provisioning a new environment should copy the updated `.env.example`.
