# ADR-0014 — Admin Auth: Edge Middleware, RBAC, Session Hardening, Audit Log

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #14 (M4 — Access & Anti-Abuse)

---

## Context

The admin dashboard lacked several critical security controls:

1. **No edge-level auth guard** — the `middleware.ts` only ran `next-intl`'s routing middleware; any unauthenticated request to `/admin/*` could render the page (even if server actions individually required a session, the HTML shell was served).
2. **No RBAC differentiation** — `requireSession` only checked for a valid JWT; staff, manager, owner, and superadmin all had identical access to every admin action.
3. **Long-lived JWT** — sessions were signed for 7 days with no revocation mechanism.
4. **No audit trail** — admin logins and mutations were not recorded, making traceback impossible.

---

## Decision

### 1. Edge middleware (fail-closed)

`src/middleware.ts` now performs JWT verification at the edge before any Next.js page render for `/admin/*` routes. If the JWT is absent, invalid, or expired, the request is redirected to `/admin/login`. The login route itself is exempted.

Detection regex accounts for both the default locale prefix-less path (`/admin/login`) and any locale-prefixed variant (`/en/admin/login`).

The middleware composes cleanly with the existing `next-intl` middleware: the admin JWT check runs first; if it passes, control flows to `intlMiddleware`.

### 2. RBAC via `assertRole` / `requireRole` (`src/lib/rbac.ts`)

A numeric `ROLE_HIERARCHY` map (`staff < manager < owner < superadmin`) drives all role checks.

- `assertRole(session, minimum)` — synchronous; throws `Forbidden` if the session role is below `minimum`. Called inside actions after the session is already in hand.
- `requireRole(minimum)` — async; resolves the session from the cookie, redirects to login if absent, then calls `assertRole`. Replaces `requireSession` for role-aware guards.

**Role assignments by action:**

| Action | Minimum role |
|---|---|
| Update order status, cancel order | `staff` |
| Create/update/delete tables, toggle item availability, update item price, create/update/delete menu items | `manager` |
| Update vendor settings | `owner` |
| (future) Superadmin-only operations | `superadmin` |

Staff cannot reach settings, menu mutations, or table mutations. Managers cannot change vendor-level financial config.

### 3. Session hardening (`src/lib/auth.ts`)

- **JWT lifetime shortened from 7 days to 1 hour** (`SESSION_TTL_SECONDS = 3600`). Cookie `maxAge` set to the same value.
- **`revalidateSession()`** — added for use on sensitive actions (currently: `updateVendorSettings`). It re-fetches the `StaffUser` row from the DB to check `active` flag and current role, then issues a fresh 1-hour JWT. If the user was deactivated or the row was deleted, the session is destroyed and `null` is returned; the caller redirects to login.

This closes the gap where a deactivated staff account's JWT remained valid until the original 7-day expiry.

### 4. Audit log (`src/lib/audit.ts`)

`recordAuditEvent(params)` writes to the `AuditLog` table (already present in the Prisma schema from ADR-0008). It is wired into:

- `login` — records every successful admin login.
- `logout` — records every explicit logout.
- `updateVendorSettings` — records before/after snapshots.
- `updateOrderStatus`, `cancelOrder` — records status transitions.
- `createTable`, `updateTableStatus`, `deleteTable` — records table lifecycle events.
- `toggleItemAvailability`, `updateItemPrice`, `updateItem`, `createItem`, `deleteItem` — records menu mutations.

Audit writes are intentionally non-fatal (they run after the primary mutation). A future iteration should move them to a background queue for stricter isolation.

---

## Consequences

- All `/admin/*` routes are edge-guarded fail-closed; login is the only public admin route.
- Staff accounts cannot reach settings, menu edits, or table management.
- A compromised or deactivated account is locked out within 1 hour (or immediately if a sensitive action triggers `revalidateSession`).
- Every admin mutation is traceable to an actor, timestamp, and before/after state in `AuditLog`.
- The existing tables-actions IDOR test (`tests/tables-actions-idor.test.ts`) required only a minor mock update (`auditLog.create`) and continues to pass.

---

## Rejected alternatives

- **Redis-backed revocable sessions:** would give instant revocation but requires a Redis dependency not yet in the stack. The 1-hour TTL + `revalidateSession` on sensitive actions achieves acceptable revocability without a new infra dependency. Redis-backed sessions remain the recommended upgrade path for Phase 3.
- **Per-route middleware with matchers:** Next.js `middleware.ts` runs on every matched request; a single regex-based admin check at the edge is simpler and less error-prone than per-route guards.
