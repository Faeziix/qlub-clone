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

## Admin sessions

- Sessions are signed JWTs (`src/lib/auth.ts`) keyed off `AUTH_SECRET`.
- There is no token-minting utility. Sessions are issued only through the login
  flow after password verification.

## Demo accounts

- Demo staff accounts are created only by the seed (`prisma/seed.ts`), each with
  a **unique cryptographically-random password** printed once to the seed
  output. There is no shared/static password.
- The login page lists demo accounts only when `isDemoSeedingEnabled()` is true,
  i.e. `NODE_ENV !== "production"` **and** `SEED_DEMO=true`. Never set
  `SEED_DEMO` in production.
- Table QR passcodes are cryptographically random (`crypto.randomInt`).

## Regression guard

`tests/repo-safety.test.ts` fails if a committed `.env`, the `mint-token`
backdoor, a hardcoded auth-secret fallback, pre-filled login credentials, or the
string `password123` is ever reintroduced. See `docs/adr/0001-repo-safety-hardening.md`.
