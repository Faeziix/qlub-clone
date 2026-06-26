# ADR-0017: Superadmin Tenant & Owner Management Console

**Status:** Accepted  
**Issue:** #27  
**Milestone:** M4 — Access & Anti-Abuse

## Context

The platform needs an operator surface for managing restaurants (tenants) and their staff accounts. Without this, the superadmin has no programmatic way to:

- Create a new restaurant tenant and provision its owner account
- Suspend/reactivate a restaurant (e.g. for payment issues, policy violations)
- Manage staff accounts platform-wide (role changes, deactivation)

The PRD (§1.2, §10.3, user story #26–#27) scopes this as a superadmin-only console under `/admin/superadmin`, fully isolated from vendor-scoped roles.

## Decisions

### 1. Console routes under `/admin/superadmin`

The superadmin console lives at `/admin/superadmin` with sub-routes:
- `/admin/superadmin/tenants` — tenant CRUD and suspension management
- `/admin/superadmin/staff` — platform-wide staff account management

Locality of behavior: each sub-route has `_components/` with its own client components.

### 2. Every action calls `assertRole('superadmin')` twice

Following the same two-step auth pattern as other sensitive actions (see ADR-0014):
1. `requireRole('superadmin')` — JWT-based fast check (no DB round-trip)
2. `revalidateSession()` → `assertRole(liveSession, 'superadmin')` — DB re-validation to catch revoked accounts

All superadmin actions additionally call `checkAdminActionLimit` to prevent abuse.

### 3. Suspension semantics — `active` field on Vendor

Tenant suspension is a boolean `active` flag on `Vendor`. When `active = false`:
- The customer QR ordering route (`/qr/[country]/[vendor]`) returns a `SuspendedTenantPage` (not a 404 or 500)
- `createOrderFromCart` throws `"Vendor is suspended"` — guards the order creation API
- `createReview` throws `"Vendor is suspended"` — guards the review API
- **Admin mutations are refused for vendor-scoped roles** (owner/manager/staff) — every tenant-scoped admin action (menu, orders, settings, tables) checks `vendor.active` and throws `VendorSuspended` if the tenant is suspended. Superadmin bypasses this guard to allow administrative remediation.

The `getVendorBySlugActive` function in `src/lib/queries-active.ts` wraps `getVendorBySlug` with the active check, returning null for suspended vendors. The QR page calls this instead of the original `getVendorBySlug`.

The `assertVendorAccess`/`requireOwnedTable`/`scopedOrder` helpers in each admin action module also enforce `vendor.active`, so suspension is checked at the mutation layer, not just the customer route.

### 4. Owner provisioning via `provisionOwner` action

The superadmin creates an owner `StaffUser` bound to a vendor via `provisionOwner`. The action:
- Validates input with zod
- Checks for duplicate email
- Hashes the password via `hashPassword`
- Creates the StaffUser with `role: "owner"` and `vendorId` bound to the target vendor
- Records an `AuditLog` event with `action: "PROVISION_OWNER"`

The new owner can immediately log in and will see only their own vendor's data (enforced by the existing `session.vendorId` scoping).

### 5. Staff role management — cannot promote to superadmin

`changeStaffRole` accepts only `owner | manager | staff` (via zod enum `StaffRoleSchema`). Attempting to set `superadmin` is rejected with `cannotPromoteToSuperadmin`. Modifying a superadmin account (e.g. deactivating) is also blocked.

### 6. All mutations recorded in AuditLog

Every superadmin mutation records a structured audit event:

| Action | Entity |
|---|---|
| `CREATE_TENANT` | Vendor |
| `SUSPEND_TENANT` | Vendor |
| `REACTIVATE_TENANT` | Vendor |
| `PROVISION_OWNER` | StaffUser |
| `CHANGE_STAFF_ROLE` | StaffUser |
| `DEACTIVATE_STAFF` | StaffUser |
| `REACTIVATE_STAFF` | StaffUser |

### 7. UI is Farsi-first / RTL

All superadmin UI components use RTL layout (`dir="rtl"`) consistent with the rest of the admin. Translations live in the `admin.superadmin` i18n namespace (both `fa.json` and `en.json`). The `SuspendedTenantPage` uses the `suspended` i18n namespace.

### 8. Sidebar nav conditionally shows superadmin link

The `AdminSidebar` receives `user.role` and conditionally renders the superadmin nav section (with a divider) only for `role === 'superadmin'`. Non-superadmins never see the link.

### 9. Edge-guard for superadmin paths in middleware

`src/middleware.ts` now decodes the JWT at the edge for `/admin/superadmin/*` paths and redirects non-superadmin sessions to `/admin`. This is in addition to (not a replacement for) the server-side `assertRole('superadmin')` in every action. Defense in depth: the edge stops unauthorized clients before they reach RSC rendering; the action layer enforces it for server mutations.

### 10. `SuspendedTenantPage` derives `dir` from locale

`SuspendedTenantPage` accepts a `locale` prop and derives `dir` from the locale list, rather than hardcoding `dir="rtl"`. This ensures English-locale customers of a suspended vendor see LTR layout.

## Alternatives Considered

- **Separate `/superadmin` route outside `/admin`**: Rejected. The admin layout already provides auth and sidebar; reusing it avoids duplicate layout code.
- **Hiding via middleware only**: Rejected. The action layer itself must enforce `assertRole('superadmin')` regardless of whether the UI is visible (defense in depth).
- **Middleware JWT role check only (no server-side assertRole)**: Rejected. JWT claims can be stale; server-side `revalidateSession` + `assertRole` is the only source of truth for fresh roles.

## Consequences

- Superadmins can create and manage tenants without direct DB access.
- Suspended tenants fail gracefully with a clear user-facing message, no data leak, no 500.
- The `active` field is now a hard contract: any new customer-facing mutation must check it.
- Tests cover the full authz boundary, suspension refusal, and tenant creation flow.
