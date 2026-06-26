# ADR-0016 — Self-hosted QR, Crypto Passcodes, Signed Table Tokens

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #16 (M4 — Access & Anti-Abuse)

---

## Context

The previous QR code implementation had two security/reachability problems:

1. **External QR image service (`api.qrserver.com`):** QR codes were rendered
   by fetching a PNG from this third-party service. The service is blocked or
   unreliable from Iran, making table QR codes non-functional in the primary
   production market (Track B, domestic).

2. **Non-cryptographic table passcodes:** `Math.random()` was used to generate
   the 4-digit numeric passcode stored on every `DiningTable` row. `Math.random()`
   is a pseudo-random number generator with a predictable internal state; it is
   not suitable for security-relevant values.

3. **No table token:** The QR URL contained only `?table=<code>` (the human-readable
   table code). There was no verifiable claim that the QR was issued by the
   owning vendor, meaning a guest could manually craft a URL for any table at
   any vendor with no cryptographic check.

---

## Decision

### 1. Server-side QR via `/api/qr` (`src/app/api/qr/route.ts`)

A new `GET /api/qr?data=<url>&size=<px>` route generates QR codes using the
`qrcode` npm package (Node.js, no canvas — server-only). Returns a `image/png`
response with `Cache-Control: public, max-age=31536000, immutable` since the
QR content is stable for the lifetime of the token.

- No external HTTP call; works entirely within the domestic network.
- `data` is URL-encoded and validated (min 1, max 2000 chars).
- `size` is clamped to 64–512 px (default 256).
- Error correction level M; high-contrast black-on-white output.

`TablesGrid.tsx` was updated to use `/api/qr?size=160&data=<fullUrl>` instead
of the `api.qrserver.com` URL.

### 2. Crypto-secure passcodes (`src/lib/table-token.ts → cryptoPasscode`)

`cryptoPasscode()` uses `crypto.getRandomValues(new Uint32Array(1))` (the Web
Crypto API, available in Node 20 without any import) and maps the result to a
4-digit string in `[1000, 9999]`. `Math.random()` is removed from `actions.ts`.

### 3. Signed table tokens (`src/lib/table-token.ts`)

On every `createTable` call, `signTableToken({ vendorId, tableId })` issues a
compact JWS (JSON Web Signature) token signed with HMAC-SHA256 using the
application's `AUTH_SECRET`:

```
header.payload.signature   (base64url encoded, "." delimited)
```

Payload claims:
- `vendorId` — the owning vendor's DB primary key
- `tableId` — the newly created `DiningTable.id`
- `sub: "table-access"` — intent claim
- `iat` / `exp` — issued-at and expiry (default TTL: 1 year; configurable)

The token is stored in a new nullable `DiningTable.tableToken` column
(migration `0003_dining_table_token`) and embedded in the QR URL as `?tt=<token>`.

`verifyTableToken(token)` uses `jose.jwtVerify` and:
- Verifies the HMAC-SHA256 signature against the current `AUTH_SECRET`.
- Checks the `sub` claim.
- Rejects expired tokens.
- Returns `{ vendorId, tableId }` on success, `null` on any failure.

### 4. Guest entry validation (`src/app/[locale]/qr/[country]/[vendor]/page.tsx`)

The `resolveVerifiedTableCode` helper on the vendor menu page:

1. Loads the vendor by slug → gets `vendor.id`.
2. If no `?tt=` param is present → treats table as unverified (no hard block
   yet; degraded browse-only mode for backward compat with legacy QR codes
   without a token).
3. Calls `verifyTableToken(tt)` → if null, clears the table code (returns `null`).
4. Checks `claims.vendorId === vendor.id` → rejects foreign-vendor tokens.
5. Looks up the `DiningTable` by `(vendorId, code)` → checks `claims.tableId ===
   table.id` → rejects tokens whose `tableId` does not match the URL's table code.

This means a token signed for `vendor:A / table:T1` cannot be replayed for
`vendor:B / table:T2` even if the HMAC is intact.

---

## Trust model

| Scenario | Outcome |
|---|---|
| Valid QR scan (matching vendor + table) | Token verified → `tableCode` passed to guest UX |
| Expired token (old QR print) | `verifyTableToken` returns null → `tableCode = null` |
| Token signed by different `AUTH_SECRET` | Signature check fails → `tableCode = null` |
| Token with mutated `vendorId` in payload | HMAC covers header+payload → signature invalid → null |
| Token issued for a different vendor (cross-tenant replay) | `claims.vendorId !== vendor.id` → null |
| Token issued for a different table at the same vendor | `claims.tableId !== table.id` → null |
| No `?tt=` in URL (legacy or direct link) | Unverified access — degraded mode, no table-scoped auth |

**The "no token" → degraded mode** is intentional: existing printed QR codes
(without a token in the URL) and direct navigation still allow browsing the menu.
A hard block will be introduced in the guest OTP/auth phase (Phase 3) once the
full auth flow is in place. The PRD notes that the guest-entry token is the
first layer in a multi-layer defence.

---

## Rejected alternatives

- **QR as data URI embedded in the HTML:** Would work but inflates the HTML
  payload (a 256×256 PNG data URI is ~3 KB base64), and the client-component
  would need to generate it at runtime or the server-component would need to
  include it inline. The `/api/qr` route separates concerns and allows the
  browser to cache the PNG independently.
- **HMAC-SHA256 without JWT framing (`vendorId:tableId:signature`):** Simpler
  to implement but `jose` is already a project dependency (used for admin JWT
  sessions) and JWS gives free expiry claim semantics.
- **Symmetric encryption instead of signing:** The token is not secret (it is
  in the URL); integrity, not confidentiality, is the requirement — signing is
  the correct primitive.
- **Regenerate token on every `signTableToken` call with random nonce:** Nonces
  would make tokens unverifiable after a server restart without a nonce store.
  Deterministic signing (fixed claim set) means the same `(vendorId, tableId)`
  always produces a verifiable token from any node with the same `AUTH_SECRET`.

---

## Migration

`prisma/migrations/0003_dining_table_token/migration.sql` adds the nullable
`tableToken TEXT` column to `DiningTable`. Existing rows have `tableToken = NULL`
and degrade to unverified mode until a table is recreated or a backfill script
is run (out of scope for this issue).

---

## Consequences

- QR codes work inside Iran (no external network call).
- Table passcodes are unpredictable.
- Every new table carries a signed token that ties it to a specific vendor; cross-tenant
  or tampered tokens are rejected at the guest entry page server component.
- `AUTH_SECRET` rotation invalidates all existing table tokens — QR codes must
  be reprinted after a secret rotation. This is acceptable behaviour (key rotation
  is an intentional event).
- `qrcode` (v1.5.4) and `@types/qrcode` added as dependencies.
