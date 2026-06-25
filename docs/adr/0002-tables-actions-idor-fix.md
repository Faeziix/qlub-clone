# ADR 0002 — Fix tables-actions IDOR: auth + vendor scoping on all table mutations

- Status: Accepted
- Date: 2026-06-25
- Issue: #3 (parent PRD #1, §3.2 / §11, user story 31)

## Context

`createTable`, `updateTableStatus`, and `deleteTable` in
`src/app/admin/tables/actions.ts` had **zero authentication or tenant-isolation
checks**. Any caller — authenticated or not, belonging to any vendor or none —
could invoke them directly as Next.js server actions:

- `createTable(vendorId, …)`: any `vendorId` could be supplied; the action would
  create a table under that vendor with no session required.
- `updateTableStatus(tableId, status)`: any table id could be passed; the action
  would write the new status with no verification that the caller owns the table.
- `deleteTable(tableId)`: same — any table could be deleted, including tables
  belonging to other vendors.

This is a classic IDOR (Insecure Direct Object Reference). Per PRD §3.3, "every
demo-acceptable gap becomes 'will lose real money / be exploited' once real Toman
flows." User story 31 names it explicitly as a P0 security defect.

The `menu/actions.ts` module (introduced in an earlier session) already
demonstrates the correct pattern: `requireSession()` + vendor-scoping guard
before any mutation. This ADR adopts the same pattern for table mutations.

## Decision

All three table mutations now require:

1. **A valid admin session.** `requireSession()` (from `src/app/admin/actions.ts`)
   calls `getSession()` and redirects to `/admin/login` if there is none. This
   redirect happens **before any database read**, so unauthenticated callers
   cannot probe for table existence.

2. **Vendor ownership verification.** A synchronous helper
   `assertVendorOwnership(sessionVendorId, targetVendorId)` compares the session's
   `vendorId` against the target. Superadmins (`vendorId null`) are exempted and
   may mutate any vendor. Scoped admins receive `Forbidden: table belongs to
   another vendor.` if the ids differ.

For `updateTableStatus` and `deleteTable`, a new `requireOwnedTable(tableId)`
helper sequences the operations correctly:
  1. Validate session first (redirect immediately if unauthenticated).
  2. Fetch the table by id (opaque "not found" error prevents existence leak).
  3. Assert vendor ownership via `assertVendorOwnership`.

For `createTable`, `vendorId` is a parameter, so `requireSession()` and
`assertVendorOwnership` are called directly at the top of the action.

## Consequences

- Unauthenticated server-action calls to all three table mutations are rejected
  before any database access.
- Cross-vendor writes are rejected with `Forbidden: …`; no DB read or write
  occurs for the target table.
- The `requireOwnedTable` helper prevents table-existence leakage to
  unauthenticated callers.
- Superadmins retain full cross-vendor access.
- `tests/tables-actions-idor.test.ts` encodes these invariants (10 tests) and
  will fail CI if the auth or scoping guards are removed or weakened.

## Testing

Three test suites in `tests/tables-actions-idor.test.ts`:

| Suite | What it covers |
|---|---|
| Unauthenticated rejection | All three actions redirect to `/admin/login` with no DB call |
| Cross-tenant write denied | Session owner of vendor B cannot mutate vendor A's tables |
| Authorised happy-path | Own-vendor mutations succeed; superadmin may mutate any vendor |
