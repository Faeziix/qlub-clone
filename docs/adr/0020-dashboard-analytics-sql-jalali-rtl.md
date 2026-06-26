# ADR-0020 — Dashboard analytics: tips-excluded revenue, correct avgOrder, real deltas, Jalali buckets, RTL chart

**Status:** Accepted  
**Date:** 2026-06-26  
**Addresses:** issue #19 (dashboard analytics correctness)

## Context

The admin dashboard had four compounding correctness bugs in its revenue metrics:

1. **Revenue included tips.** `getDashboardStats` summed `Payment.total` which is `amount + tipAmount`. The schema deliberately keeps tips in `Payment.tipAmount` so revenue analytics can exclude them (PRD user story #21: "revenue to exclude tips").

2. **avgOrder divided by payment count, not order count.** A split-bill order with three legs counted as three "orders" in the average, inflating the figure.

3. **Period-over-period deltas were hardcoded static strings** (`"+12.4%"`, `"+8.1%"`). These were never computed from real data.

4. **Revenue series buckets used UTC date keys** (`toISOString().slice(0, 10)`). For vendors in Asia/Tehran (UTC+3:30), a payment made at 23:00 Tehran time (19:30 UTC) was bucketed into the previous UTC day — shifting all series data by up to 3.5 hours.

5. **RevenueChart had LTR-only margins.** `margin={{ left: -16, right: 8 }}` pushed the Y-axis to the left side and clipped it against the right side in an RTL context. The tooltip used English text ("Revenue (toman)").

## Decision

### New module: `src/lib/dashboard-analytics.ts`

A pure, server-side, testable module with four exported functions:

- **`buildJalaliDayKey(date)`** — converts a UTC `Date` to a Jalali `YYYY-MM-DD` key in `Asia/Tehran` using the existing `getJalaliParts` deep module. This is the canonical bucketing key.

- **`aggregateRevenueStats(payments)`** — accepts `PaymentRow[]` (with `orderId`, `amount`, `tipAmount`, `total`, `createdAt`) and computes:
  - `revenueRial = sum(payment.amount)` — tips excluded
  - `tipsRial = sum(payment.tipAmount)` — tracked separately
  - `distinctOrderCount = Set(orderId).size` — each order counted once
  - `avgOrderRial = revenueRial / distinctOrderCount`

- **`computePeriodDelta(current, previous)`** — returns a real `number` percentage (`(current - previous) / previous * 100`); returns `0` when `previous === 0n` (no prior-period data rather than `Infinity`).

- **`computeRevenueSeries(payments, windowDays, windowEnd)`** — builds a `RevenueBucket[]` array bucketed by `buildJalaliDayKey`, with Farsi day labels from `JALALI_MONTH_NAMES_FA` and `latinDigitsToPersian`.

### `getDashboardStats` in `queries.ts`

- Fetches both the current 30-day window and the previous 30-day window in a single `Promise.all`.
- Uses `select` projection (`orderId`, `amount`, `tipAmount`, `total`, `createdAt`) instead of fetching all payment fields — reduces wire data.
- Calls `aggregateRevenueStats` for both windows.
- Calls `computePeriodDelta` for revenue and order count, returning `revenueDelta` and `orderCountDelta` as real numbers.

### Dashboard page (`src/app/[locale]/admin/page.tsx`)

- Replaces the inline `buildRevenueSeries` JS function (which used UTC bucketing and summed `p.total`) with `computeRevenueSeries` from the new module.
- Passes real deltas from `stats.revenueDelta` / `stats.orderCountDelta` to `StatCard`, formatted as `+X.Y%` via `formatDelta`.
- Removes the unused `bigintToNumber` import (now encapsulated in `dashboard-analytics.ts`).

### `RevenueChart` component

- Accepts an `rtl` prop (defaults to `true` for Farsi-first).
- When `rtl=true`: margins flip (`right: -16, left: 8`), `YAxis` orientation becomes `"right"`, `XAxis` gains `reversed={true}`.
- Chart container gets `dir="ltr"` to prevent SVG coordinate reversal while keeping Y-axis on the right side of the plot area.
- Tooltip text updated to `"درآمد (تومان)"` with `direction: "rtl"` on the content style.
- Amount format follows the `formatMoney` convention (toman via `formatRialAsToman`).

## Consequences

- Revenue and avgOrder figures are now financially correct per the schema design (PRD §5.3: "Tips tracked on Payment, not folded into order.total").
- Period-over-period deltas respond to real data; they display `+0.0%` when there is no prior-period data rather than a misleading static positive number.
- Revenue series day boundaries match what the restaurant owner sees on a Jalali calendar, eliminating off-by-one-day discrepancies.
- The analytics module is fully unit-testable without a database (25 tests, all passing).
- The RTL chart renders with the Y-axis on the right and labels reading right-to-left, consistent with the Farsi-first design system (ADR-0012).
