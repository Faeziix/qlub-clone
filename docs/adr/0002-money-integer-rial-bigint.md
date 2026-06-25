# ADR-0002 — Integer-rial money model: BigInt + money.ts deep module

**Status:** Accepted  
**Date:** 2026-06-26  
**Addresses:** issue #7 (Integer-rial money model + property tests)

## Context

The original codebase stored all money as `Float` (IEEE 754 double), used a `round2` helper (`Math.round(n * 100) / 100`) to mask drift, and compared totals with an epsilon (`amountPaid >= total - 0.01`) to determine "fully paid". For a demo product this was acceptable. For a live Iranian payment product where amounts are in rial (very large integers) and the real-money invariant is critical, these practices are unsafe:

- IEEE 754 cannot represent many rial amounts exactly.
- `round2` silently loses sub-cent precision; for rial integers there are no sub-cent amounts.
- The epsilon comparison `>= total - 0.01` means an order can be marked paid while still 0.009 rial short — or, in some arithmetic edge cases, when over-paid. For large rial amounts the error is negligible, but the pattern is categorically wrong for a financial ledger.
- JSON serialization: `JSON.stringify` throws on `bigint` — a regression that broke the entire payment flow silently in a previous version.

## Decision

1. **Canonical money unit: integer rial stored as `BigInt`** in every Prisma column typed `BigInt` (confirmed: all `price`, `priceDelta`, `amount`, `tipAmount`, `total`, `subtotal`, `serviceCharge`, `tax`, `discount`, `amountPaid`, `lineTotal`, `unitPrice`).

2. **`money.ts` is the single conversion module** — the only file that may convert between rial bigint, toman display, gateway wire format, JSON request bodies, and localStorage. All other files import from `money.ts`; they never perform raw arithmetic on rial and toman together.

3. **`MONETARY_UNIT = 10n`** — the rial-per-toman ratio. If the Central Bank of Iran implements the redenomination (converting 10 rial → 1 toman as the new rial), this constant is the only place to change.

4. **`round2` removed** — integer arithmetic requires no rounding.

5. **Epsilon comparison removed** — `amountPaid >= prevTotal` (exact bigint comparison) replaces `amountPaid >= total - 0.01`.

6. **JSON/localStorage boundary** — all BigInt money crosses JSON via `bigintToJson` (encodes as string) / `bigintFromJson` (decodes string|number → bigint). The cart store uses `cartMoneyReplacer`/`cartMoneyReviver` to safely persist BigInt amounts in localStorage.

## Boundaries

| Boundary | Function | Direction |
|---|---|---|
| Admin price input (toman string) | `parseRialFromInput(tomanInput)` | string toman → bigint rial |
| UI display (toman) | `formatRialAsToman(rial)` | bigint rial → string toman |
| DB storage (Prisma coercion) | `rialForStorage` / `rialFromStorage` | bigint ↔ string |
| Payment gateway wire | `rialForGateway` / `rialFromGateway` | bigint ↔ string |
| JSON request body | `bigintToJson` / `bigintFromJson` | bigint ↔ string |
| localStorage (zustand persist) | `cartMoneyReplacer` / `cartMoneyReviver` | bigint ↔ tagged string `__bigint__N` |

## Consequences

- All money operations are exact: no float drift, no epsilon hacks.
- The `pricing.ts` module uses `bigint` arithmetic throughout (`lineTotal`, `cartSubtotal`, `computeBill`, `evenSplit`, `tipFromPct`).
- `orders.ts` `recordPayment` uses pure `bigint` arithmetic for `fullyPaid`.
- Admin price inputs accept toman integers; the UI labels are updated from "Price (AED)" to "Price (toman)"; `step="0.01"` float inputs are gone.
- Property-based tests in `tests/money.test.ts` (35 tests, fast-check) cover all six boundaries and the ×10/×1000 zero-drift invariant.
- RSC (server) → client component boundaries continue to pass money as `number` (via `bigintToNumber` in `api-serializers.ts` and `queries.ts`) since Next.js App Router cannot serialise `BigInt` over the wire. This is correct: those numbers are rial display values, not used for financial computation.

## References

- Issue #7 — implementation
- PRD §5.2 (money = integer rial in `BigInt`, single util, `MONETARY_UNIT`)
- fast-check property tests (`tests/money.test.ts`)
