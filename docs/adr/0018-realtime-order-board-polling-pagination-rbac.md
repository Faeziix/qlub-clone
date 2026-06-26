# ADR-0018 — Real-time order board v1: polling, pagination, RBAC-gated status workflow

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #17

---

## Context

The existing order board (`/admin/orders`) was a static RSC hydrated once — new orders did not appear without a manual page refresh. Issue #17 requires:

1. New orders appear within ~10 s without a manual refresh.
2. Status transitions (placed → preparing → ready → served → paid) are RBAC-gated.
3. The order list is paginated/cursored.
4. Ceiling-split orders display as one order with N sub-charges.

SSE / Postgres LISTEN-NOTIFY push transport is explicitly deferred to a later scale slice; polling is the approved v1 approach.

---

## Decision

### 1. Polling endpoint: `/api/admin/orders`

A new GET route at `/api/admin/orders` serves the admin board client. It:

- Verifies the admin JWT from either the `qlub_admin_session` cookie or a `Bearer` token header.
- Scopes results to the session's `vendorId` (or any vendor for `superadmin`).
- Supports cursor-based pagination via an ISO timestamp cursor (`?cursor=<ISO>&limit=<n>`).
- Serializes `BigInt` money fields to `number` at the RSC→client boundary via `bigintToNumber`.
- Includes `parentPaymentId` on each payment so clients can identify ceiling-split sub-charges.

The endpoint is on the `/api/` tree (not a server action) so it is consumable by `axios` from the client-side polling hook with proper HTTP semantics.

### 2. Polling hook: `useOrdersPolling`

A `"use client"` hook in `_hooks/useOrdersPolling.ts` (co-located with the orders route, following locality-of-behavior):

- Accepts `initialOrders` from the server-rendered page — the first paint is fast with no loading state.
- Polls at 8 s intervals via `setInterval` (≤ 10 s as required).
- Merges incoming orders into a `Map<id, BoardOrder>` on the client so the board grows incrementally without losing unseen orders that scroll off the current filter.
- Exposes `loadMore` (cursor-based) and `refresh` (manual re-fetch from the top).
- Uses `axios`, consistent with the project-wide rule.

### 3. RBAC-gated status transitions

The PRD specifies: staff → order status only; manager/owner → all.

`updateOrderStatus` in `actions.ts` now enforces two tiers:

| Transition target | Minimum role |
|---|---|
| `placed`, `preparing`, `ready`, `served` | `staff` (all roles) |
| `paid`, `open`, `cancelled` | `manager` |

`cancelOrder` now also requires `manager` (it is destructive and triggers table de-occupation).

Both use `assertRole(session, "manager")` from `lib/rbac.ts` — no new auth primitives required.

### 4. Ceiling-split display

A payment with `parentPaymentId !== null` is a ceiling-split sub-charge. The board:

- Adds a `parentPaymentId` field to `BoardPayment`.
- `CeilingSubChargesBadge` counts sub-charges and shows a `Layers` icon + count on the `OrderRow` and in the payment section header of `OrderDetail`.

---

## Alternatives considered

- **SSE / LISTEN-NOTIFY**: Lower latency but requires a persistent connection and Postgres subscription setup. Deferred to v2 scale slice as the PRD specifies.
- **SWR/React Query**: Not a current project dependency; axios + `setInterval` achieves the same result without adding a library.

---

## Consequences

- Board latency: ≤ 8 s (well within the 10 s requirement).
- Server load: 1 DB query per staff member every 8 s; acceptable for v1 restaurant scale.
- Pagination: cursor is the `createdAt` timestamp of the last item; `take: limit + 1` pattern avoids extra COUNT queries.
- Staff role enforcement is now explicit and testable (24 new tests added in `tests/order-board-polling.test.ts`).
