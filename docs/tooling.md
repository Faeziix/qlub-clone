# Tooling

## Package manager

**bun** is the only package manager used in this project. Never use `npm`, `pnpm`, or `yarn`. All scripts in `package.json` invoke `bun` or `bunx`.

Install dependencies:

```bash
bun install
```

Run a script:

```bash
bun run <script>
```

Execute a binary without installing globally:

```bash
bunx prisma generate
```

## Node version

Node **≥ 20** is required. The minimum version is enforced in two places:

- `package.json` — `engines.node: ">=20"` (tooling and CI read this)
- `.nvmrc` — `20` (nvm / `fnm` users: `nvm use` or `fnm use` picks this up automatically)

If you use [fnm](https://github.com/Schniz/fnm):

```bash
fnm use          # reads .nvmrc
```

If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use          # reads .nvmrc
```

## Environment variables

All required variables are documented in `.env.example`. Copy it to `.env` and fill in values before running the app.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma database URL. SQLite `file:./dev.db` for local dev; pooled Postgres URL in staging/production. |
| `DIRECT_URL` | Pooled Postgres only | Unpooled connection URL for Prisma migrations. Not needed for SQLite or direct Postgres. |
| `AUTH_SECRET` | Yes | JWT signing secret. The app refuses to start without it. Generate with `openssl rand -base64 48`. |
| `NEXT_PUBLIC_APP_NAME` | No | Display name used in the UI. Defaults to `"qlub"`. |
| `SEED_DEMO` | No | Set to `true` in non-production to seed demo accounts and show them on the login page. **Never set in production.** |

## CI

GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | Pull requests + pushes to `main` | `typecheck-and-lint` (tsc + eslint), `test` (vitest) |

`eslint.ignoreDuringBuilds` is not set in `next.config.mjs`. ESLint must pass cleanly before a build is considered valid. The CI workflow enforces this on every PR.

### Running CI checks locally

```bash
bun run typecheck   # tsc --noEmit
bun run lint        # eslint .
bun run test        # vitest run
```
