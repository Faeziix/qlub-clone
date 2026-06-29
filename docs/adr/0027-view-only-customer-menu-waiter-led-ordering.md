# ADR-0027 — View-only customer phone menu (Waiter-Led Ordering)

**Status**: Accepted  
**Date**: 2026-06-29  
**Issue**: #54 — [AFK] Customer phone menu becomes view-only

## Context

With waiter-led order entry (#52) and payment repoint to the table's open bill (#53) in place, the customer-facing ordering UI (add-to-cart, quantity stepper, place-order, append items) is dead weight. Guests should only browse the menu and pay; the waiter enters orders on the admin console.

Keeping dead ordering code creates:
- A confused UX (guests can "add" items that never reach the kitchen)
- Unnecessary API surface (`POST /api/orders`, `PATCH /api/orders/[orderId]`) that could be abused or confused with the waiter flow
- Stale Zustand cart state in localStorage

## Decision

**Customer phone menu is now view-only.** Specifically:

1. **`POST /api/orders` removed** — the route file is deleted. Any request returns 404. The waiter uses the `createOrAppendWaiterOrder` server action (RBAC-gated, staff+) instead.

2. **`PATCH /api/orders/[orderId]` removed** — the handler is deleted from the route. The GET handler for order status polling is preserved.

3. **Cart Zustand store (`useCart`) removed from customer flow** — `CartSheet.tsx` and `CartLineItem.tsx` are deleted. `MenuExperience` no longer imports or initialises the cart store.

4. **`ItemSheet` transformed to read-only item detail** — modifier groups are rendered as static `<li>` lists with option names and price deltas; no interactive buttons, no quantity stepper, no notes textarea, no `addLine` call.

5. **ItemCard "+" badge removed** — the brand-colored add indicator is gone since tapping the card now opens a read-only detail sheet.

6. **`MyOrderSheet` "Add more items" button removed** — the `onAddMoreItems` prop and the secondary button are deleted.

7. **Active-order auto-fetch on mount** — `MenuExperience` now auto-fetches the table's open bill on mount (`GET /api/orders/active` → `GET /api/orders/{id}`) when `tablePublicId` is provided, so the "My Order" status banner and sheet are populated from the waiter's order without any customer-side order placement.

8. **`tableCode` prop dropped** — was only used for cart scoping; no longer needed.

## Consequences

- **Order status tracking preserved**: customers can still see the waiter's order (My Order sheet) and track preparation status.
- **Pay path intact**: "Pay bill" on the landing page and in MyOrderSheet both resolve the table's open bill via `/api/orders/active`.
- **No regression in payment/receipts/reviews**: payment, callback, reconciliation, and review flows are unchanged.
- **Waiter ordering unaffected**: `createOrderFromCart` and `appendItemsToOrder` library functions remain; only the unauthenticated HTTP endpoints are gone.
- **Smaller client bundle**: cart store, CartSheet, CartLineItem no longer shipped to the browser.

## Dead i18n keys

Several i18n keys become dead (e.g. `addToOrder`, `viewOrder`, `placeOrder`, `appendFailed`, `confirmNewOrder`). They are retained in the dicts to avoid noise in this PR; a separate cleanup pass can remove them once confirmed safe.
