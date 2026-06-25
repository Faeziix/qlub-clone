# ADR 0004 — Integer-rial money model: BigInt storage, money.ts deep module, property tests

- Status: Accepted
- Date: 2026-06-25
- Issue: #7 (parent PRD #1, §5.2)

## Context

The repository stored all monetary values as `Float` (IEEE 754 double-precision
floating-point). This introduced rounding drift, which was papered over with:

- A `round2` utility (`Math.round((n + Number.EPSILON) * 100) / 100`),
- An epsilon comparison `amountPaid >= total - 0.01` to determine if an order
  was fully paid.

For a UAE demo, these hacks were tolerable. For a real-money Iran product:

- `Float` drift accumulates silently across split-bill legs and can result in
  incorrect "fully paid" determinations.
- `round2` has no semantic meaning in a rial-denominated context — rial has no
  sub-unit fractions. The concept of "2 decimal places" is category-error.
- The epsilon `- 0.01` is arbitrary and exploitable; it implies 0.01 toman of
  slack per payment leg, compounding across legs.
- Iranian rial pricing uses whole-number amounts. The notion of `0.5 rial` does
  not exist in practice.

Additionally, Iran is legislatively redenominating its currency (rial → toman),
and Iranians colloquially quote prices in toman (often with implied thousands).
A naive `÷10 + "تومان"` in scattered display code mislabels by up to 1000× in
common real-world cases.

## Decision

### 1. All money is stored as integer rial in `BigInt`

Every money column in the Prisma schema is changed from `Float` to `BigInt`:

- `MenuItem.price`
- `ModifierOption.priceDelta`
- `Order.subtotal`, `.serviceCharge`, `.tax`, `.discount`, `.tipAmount`,
  `.total`, `.amountPaid`
- `OrderItem.unitPrice`, `.lineTotal`
- `Payment.amount`, `.tipAmount`, `.total`

Percentage config fields (`serviceChargePct`, `taxPct`) remain `Float` because
they are configuration scalars, not monetary amounts.

### 2. `money.ts` is the only place conversions happen

A single `src/lib/money.ts` deep module owns every conversion at named
boundaries. No other file may perform rial↔toman or rial↔gateway conversions.

The boundary table:

| Boundary | Unit | Conversion from canonical (rial) |
|---|---|---|
| Storage / ledger | integer rial (`BigInt`) | identity |
| Gateway IPG `request`/`verify` | integer rial (`BigInt`, factor 1) | `rialToGatewayUnit` — **re-verify per provider** |
| Restaurant settlement display | toman | `rialToToman` (`/ 10n`) |
| Diner UI display | toman string | `formatRialAsToman` |
| Redenomination contingency | new unit | one data migration by legislated factor |

### 3. `MONETARY_UNIT` constant

A single `MONETARY_UNIT = "IRR"` constant in `money.ts` captures the canonical
storage unit. If/when redenomination takes legal effect, one constant edit plus
one data migration (`× legislated_factor`) changes the entire system — no
hunting for scattered conversion call sites.

### 4. `round2` and the epsilon comparison are removed

- `round2` is removed from `src/lib/utils.ts` entirely.
- The epsilon `amountPaid >= total - 0.01` in `orders.ts` is replaced by
  `isFullyPaid(amountPaid, total)` from `money.ts`, which is exact integer
  comparison: `amountPaid >= orderTotal` (both `BigInt`).

### 5. `pricing.ts` is rewritten using `BigInt` throughout

All arithmetic in `computeBill`, `lineTotal`, `evenSplit`, and `tipFromPct` now
operates on `bigint`. Percentage application uses integer arithmetic:
`(amount * BigInt(Math.round(pct * 100))) / 10_000n`.

The `even split` distributes remainder to the first payer using exact `bigint`
division and modulo — no floating-point rounding artifacts.

### 6. Property-based tests guard every conversion boundary

`@fast-check/vitest` is added as a dev dependency. The test file
`src/lib/__tests__/money.test.ts` (32 tests including 8 property-based) verifies:

- `rial → gateway → rial` round-trips with zero drift (property test).
- `tomanToRial(rialToToman(rial))` loses at most 9 rial (truncation only, never
  amplification) (property test).
- `rialToToman(rial) <= rial` — the toman value is never larger than input rial
  (no ×10 amplification) (property test).
- `tomanToRial(toman) === toman * 10n` — always exactly the definition factor
  (property test).
- `isFullyPaid` is consistent with `paid >= total` (property test).
- `parseRialFromInput(formatRialAsToman(rial))` round-trips for multiples of 10
  (property test).
- `parseRialFromInput(tomanTyped)` always returns `tomanTyped * 10n` — regression
  guard against the x10 undercharge bug (property test).
- Deterministic unit tests for concrete conversion examples, including explicit
  regression cases for the x10 undercharge.

### 8. UI input parsing must go through `money.ts`

All user-facing money input fields must parse their values through
`parseRialFromInput` (not raw `BigInt(string)`). The distinction is:

- `parseRialFromInput("50000")` → `500_000n` rial (user typed 50,000 toman)
- `BigInt("50000")` → `50_000n` rial — a **10x undercharge**

`PaymentFlow.tsx` custom amount and custom tip fields are routed through
`parseRialFromInput`. The `inputMode` is `"numeric"` and the placeholder is `"0"`
to match the toman-integer context of the adjacent display.

### 9. Chart data passed across the server/client boundary must be toman

`RevenueChart.tsx` receives revenue as a `number` (from the RSC boundary). The
server-side `buildRevenueSeries` in `admin/page.tsx` converts BigInt rial to toman
via `rialToToman` before `Number(...)` conversion. The chart tooltip formatter uses
`toLocaleString("en-US")` for comma-separated toman display — not `.toFixed(2)`,
which has no meaning for integer toman values.

### 7. JSON serialization at the server/client boundary

Next.js RSC serialization does not support `bigint`. Money values are serialized
as `string` when passed to client components (`String(bigintValue)`), and
converted back with `BigInt(stringValue)` at the point of use. The conversion is
localized to the serialization boundary — display components do not do money
arithmetic.

## Consequences

- **No float-rounding incidents are possible** on money-path code from this
  commit forward. All money is exact integer arithmetic.
- **A single `isFullyPaid` call** replaces the epsilon hack; split-bill
  correctness is exact.
- **`round2` no longer exists**. Any future code that needs it for non-money
  purposes must compute the equivalent inline (and should not import from `utils`
  as though it were a general utility).
- **Property tests run in CI** and will catch any ×10 or ×1000 drift introduced
  by future gateway integrations before go-live.
- **The gateway factor (`GATEWAY_RIAL_FACTOR = 1n`) must be re-verified** against
  the chosen facilitator's live API documentation in Phase 4 before the gateway
  integration build. Some Iranian IPGs quote toman, not rial. The variable exists
  precisely so this is a one-line change with a named rationale.
- **`BigInt` has a JSON serialization limitation** (addressed in §7 above).
  Recharts and other numeric visualization libraries will receive `Number(bigint)`
  for chart data — this is safe for display-only purposes as the revenue figures
  will fit in a 53-bit IEEE integer at realistic scale (2^53 rial ≈ 900 trillion
  toman — unreachable in practice).
- **Seeded data and existing SQLite `dev.db` are incompatible** with the new
  `BigInt` column types. Run `bun run db:reset` to recreate the dev database with
  the updated schema.

## Testing

`src/lib/__tests__/money.test.ts` — 32 tests (8 property-based, 24 unit).
All 58 tests in the test suite pass.
