# ADR-0026 — Short opaque table codes (Crockford base32) replace signed-JWT QR links

**Status:** Accepted  
**Date:** 2026-06-29  
**Issue:** #50

---

## Context

Issue #16 added signed HMAC-SHA256 JWTs (`tt` search param) to every QR code URL to prevent table-identity forgery. The resulting URLs are ~300 chars and produce visually dense, hard-to-print QR codes:

```
/qr/ir/paul-ir?table=1&theme=darkgold&tt=eyJhbGciOiJIUzI1NiJ9.eyJ2ZW5kb3JJZCI6...
```

For a **printed** table card the HMAC adds complexity without meaningful security benefit: the vendor slug is already in the path, and IDOR protection can be enforced by a simple DB-side vendor-ownership check after a `publicId` lookup.

---

## Decision

Each `DiningTable` receives a globally unique `publicId` — an 8-character **Crockford base32** string (`[0-9ABCDEFGHJKMNPQRSTVWXYZ]`).

- 8 chars × 5 bits = 40 bits → 2^40 ≈ 1.1 trillion possible codes. Enumeration is impractical.
- Crockford base32 excludes I, L, O, U to avoid visual/voice ambiguity. Input is normalized (case-fold, strip dashes/spaces, I→1, L→1, O→0) before lookup.
- Generation: `crypto.getRandomValues` (CSPRNG) in a regenerate-on-unique-constraint-collision loop.
- The new URL shape collapses to a path segment — no query params:
  ```
  /qr/ir/paul-ir/t/8F3KQ2M9
  ```
- Resolution: `DiningTable.publicId` lookup, then **vendor-ownership assertion** (`table.vendorId === vendor.id`) before binding table context. Unknown code or foreign-vendor mismatch → graceful browse-only degradation (no 404).
- IDOR guarantee: a `publicId` minted for vendor A cannot bind a session to vendor B's table because the resolved row's `vendorId` is checked against the URL `<vendor>` slug.

---

## Changes

| Area | Change |
|------|--------|
| `prisma/schema.prisma` | `DiningTable.publicId String @unique`; `tableToken` column removed |
| `prisma/migrations/0010_table_public_id/` | Adds column, backfills via PL/pgSQL DO block using `gen_random_bytes(5)`, adds NOT NULL + UNIQUE, drops `tableToken` |
| `src/lib/table-code.ts` | `generateTablePublicId()`, `normalizeTablePublicId()`, `isValidTablePublicId()` |
| `src/lib/table-token.ts` | JWT functions (`signTableToken`, `verifyTableToken`) removed; `cryptoPasscode()` retained for staff passcodes |
| `src/app/[locale]/qr/[country]/[vendor]/page.tsx` | Old `?table=&tt=` handling removed; renders browse-only |
| `src/app/[locale]/qr/[country]/[vendor]/t/[publicId]/page.tsx` | New route; resolves table, asserts vendor ownership |
| `src/components/admin/tables/TablesGrid.tsx` | `buildCustomerUrl` emits `/qr/${country}/${slug}/t/${publicId}` |
| `src/app/[locale]/admin/tables/actions.ts` | `createTable` generates `publicId` with collision-retry loop |
| `prisma/seed.ts` | JWT signing removed; tables seeded with `generateSeedPublicId()` |
| `tests/table-code.test.ts` | New: generation, normalization, IDOR, JWT-free URL assertions |
| `tests/table-tokens.test.ts` | Trimmed to `cryptoPasscode` only |

---

## Consequences

- **QR codes are visibly less dense** — ~30 chars vs ~300 chars.
- **No external signing key dependency** — `publicId` lookup works without `AUTH_SECRET`; passcodes still use it for admin staff login.
- **Graceful degradation preserved** — unknown or foreign publicId silently downgrades to browse-only, same UX as before.
- **Normalization allows printed ambiguities** — diners who misread O as 0 or I as 1 still land correctly.
