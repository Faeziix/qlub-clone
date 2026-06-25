# ADR 0005 — Schema modernization: native enums, native Json, Iran defaults, translation tables, per-vendor orderNumber, AuditLog, sub-merchant fields

- Status: Accepted
- Date: 2026-06-25
- Issue: #8 (parent PRD #1, §5.3)

## Context

The original schema used `String` columns to encode both enum-like values (e.g.
`status: "paid"`, `role: "owner"`) and JSON arrays (e.g. `supportedLangs`,
`tipPresets`, `tags`, `modifiers`, `splitMeta`). This caused several problems:

- **Enum integrity.** Any string could be written to a `String` status column.
  Prisma generated no TypeScript enum type, so consumer code used untyped string
  literals and had no compile-time guard against typos or removed values.
- **JSON-as-String.** Columns declared `String` but holding JSON required
  manual `JSON.stringify` on write and `JSON.parse` on read. Any new consumer
  had to remember to do both. With Prisma's native `Json` type, the ORM handles
  serialization and exposes proper `JsonValue` in TypeScript.
- **UAE-era defaults.** `currency: "AED"`, `locale: "en"`, `timezone:
  "Asia/Dubai"`, `supportedLangs: ["en","ar"]`, `country: "ae"` were all
  hardcoded defaults that had to be overridden in every Iran deployment.
- **No VAT toggle.** The schema had a single `taxPct` with no per-vendor
  switch for VAT. This matters because Iranian VAT applicability is
  per-business-type and must be confirmed by an accountant (PRD §6 open
  question); it defaults off until the legal/accounting question is resolved.
- **Date.now() orderNumbers.** `Order.orderNumber` was globally `@unique` but
  generated from `Date.now()` — a non-monotonic, non-sequential, collision-prone
  mechanism. For split-bill and reconciliation, vendor staff expect sequential
  order numbers scoped to their restaurant, not a global timestamp fragment.
- **Review per-Order.** `Review.orderId @unique` made one review per order
  impossible to associate with which payer left it. In a split-bill scenario
  multiple payers share one order; each should be able to review once. (ADR-0007)
- **No audit trail.** Admin mutations and logins had no append-only record.
- **No sub-merchant fields.** The `Vendor` model had no place to store gateway
  onboarding data (`gatewaySubMerchantId`, IBAN, KYC) required for Phase 4/5
  payment-facilitator integration.
- **No bilingual content.** Menu items, categories, and modifier groups had a
  single `name`/`description` — no separate Farsi/English fields.

## Decision

### 1. Native Prisma enums replace string "enums"

Every field that previously held one of a fixed value set is now typed as a
native Prisma enum:

| Enum | Values |
|---|---|
| `OrderStatus` | `open`, `placed`, `preparing`, `ready`, `served`, `paid`, `cancelled` |
| `OrderType` | `qsr`, `dinein` |
| `OrderSource` | `qr`, `pos` |
| `PaymentStatus` | `pending`, `succeeded`, `failed`, `refunded`, `expired` |
| `PaymentMethod` | `ipg`, `cash` |
| `SplitType` | `full`, `even`, `items`, `custom` |
| `StaffRole` | `superadmin`, `owner`, `manager`, `staff` |
| `TableStatus` | `available`, `occupied`, `bill_requested` |
| `EnamadStatus` | `none`, `pending`, `verified`, `rejected` |

`PaymentMethod` removes the UAE-era methods (`card`, `apple_pay`, `google_pay`,
`tabby`, `benefit`) and the banned `card_to_card`. Only `ipg` (internet payment
gateway — the Iranian Shaparak rail) and `cash` are legal for Iran production.

`src/lib/schema-types.ts` is the single source of truth for enum value sets.
It exports const arrays (e.g. `ORDER_STATUSES`) and type guards (e.g.
`isValidOrderStatus`) that can be used in server actions and route handlers
without importing `@prisma/client`.

### 2. Native `Json` columns replace JSON-as-String

| Model | Column | Change |
|---|---|---|
| `Vendor` | `supportedLangs` | `String` → `Json` |
| `Vendor` | `tipPresets` | `String` → `Json` |
| `Menu` | `availability` | `String?` → `Json?` |
| `MenuItem` | `tags` | `String` → `Json` |
| `OrderItem` | `modifiers` | `String` → `Json` |
| `Payment` | `splitMeta` | `String?` → `Json?` |
| `AuditLog` | `before`, `after` | new `Json?` columns |

Consumer code no longer calls `JSON.stringify` / `JSON.parse`. Where client
components expect a serialized string (e.g. `BoardItem.modifiers`), the server
page serializes explicitly at the boundary with `JSON.stringify(it.modifiers)`.
The `parseJSON` utility is updated to accept `unknown` so it gracefully handles
both legacy string values (for older SQLite rows) and parsed JSON arrays.

### 3. Iran defaults

`Vendor` model defaults are updated to:

| Field | Old default | New default |
|---|---|---|
| `country` | `"ae"` | `"ir"` |
| `currency` | `"AED"` | `"IRR"` |
| `locale` | `"en"` | `"fa"` |
| `timezone` | `"Asia/Dubai"` | `"Asia/Tehran"` |
| `supportedLangs` | `["en","ar"]` | `["fa","en"]` |

`IRAN_VENDOR_DEFAULTS` in `schema-types.ts` is the authoritative constant.
Seed files, tests, and future onboarding code must import from this constant,
not hardcode strings.

### 4. Per-vendor VAT config

A `vatEnabled Boolean @default(false)` + `vatPct Float @default(0)` are added
to `Vendor`. VAT defaults off because Iranian VAT applicability depends on
business type and must be confirmed by an Iranian accountant before any vendor
is configured with a non-zero rate (PRD §6 open question / §15).

The field is distinct from `taxPct`, which handles legacy inclusive/exclusive
tax calculations. `vatEnabled`/`vatPct` are for the statutory VAT line on the
invoice; the pricing engine (`pricing.ts`) will need a Phase 4 update to apply
both when `vatEnabled` is true.

### 5. Bilingual translation tables

Three new child tables mirror the `fa`+`en` authoring model:

- `MenuItemTranslation{menuItemId, locale, name, description}` — `@@unique([menuItemId, locale])`
- `CategoryTranslation{categoryId, locale, name}` — `@@unique([categoryId, locale])`
- `ModifierGroupTranslation{modifierGroupId, locale, name}` — `@@unique([modifierGroupId, locale])`

The parent models keep `name`/`description` as the fallback (canonical language,
typically Farsi for the Iran product). Translations are additive — the UI falls
back to the parent if no translation exists for the requested locale.

### 6. Review is per-Payment (ADR-0007 implementation)

`Review.orderId @unique` is replaced by `Review.paymentId @unique`.

Each `Payment` may have at most one `Review`. In a split-bill scenario each
payer has a distinct `Payment`, so each payer can review once. This resolves
the conflict where multiple payers on the same order all tried to write
`Review.orderId` to the same value.

The `Order` model no longer has a `review` back-relation. The `reviews` admin
page resolves `orderNumber` via `payment.order.orderNumber`.

### 7. Per-vendor orderNumber sequence

`Order.orderNumber` is changed from:
- `@unique` + `Date.now()` generation

to:
- `@@unique([vendorId, orderNumber])` + per-vendor counter in `Vendor.vendorOrderSeq`

`createOrderFromCart` in `orders.ts` now runs inside a `$transaction` that
increments `Vendor.vendorOrderSeq` and writes `Order.orderNumber` atomically.
The formatted number is `V-000001`, `V-000002`, … (6-digit zero-padded, growing
beyond 6 digits without truncation).

The `nextOrderNumber` helper in `schema-types.ts` is a pure function (no DB
access) tested in `schema-enums.test.ts`.

**Deterministic backfill for existing orders:** The seed generates order numbers
sequentially starting from 1, then updates `Vendor.vendorOrderSeq` to the final
count. Any production migration of existing SQLite `Date.now()` order numbers
must use a `ROW_NUMBER() OVER (PARTITION BY vendorId ORDER BY createdAt)` to
assign deterministic numbers — this is safe because no live traffic could have
relied on the old format.

### 8. AuditLog

A new `AuditLog` model is added:

```
model AuditLog {
  id       String   @id @default(cuid())
  actorId  String       -- StaffUser.id
  vendorId String?      -- null for superadmin cross-tenant actions
  action   String       -- "LOGIN", "UPDATE", "CREATE", "DELETE"
  entity   String       -- Prisma model name, e.g. "MenuItem"
  entityId String
  before   Json?
  after    Json?
  at       DateTime @default(now())
}
```

`AuditLogEntry` interface in `schema-types.ts` mirrors this for service-layer
use without importing `@prisma/client`. Populating the audit log on admin
mutations is a Phase 3 task (after auth/RBAC middleware is in place).

### 9. Sub-merchant fields on Vendor

The following fields are added to `Vendor` for Phase 4/5 gateway onboarding:

| Field | Type | Purpose |
|---|---|---|
| `gatewaySubMerchantId` | `String?` | Issued by the payment facilitator after sub-merchant onboarding |
| `payoutIban` | `String?` | Restaurant's CBI-verified IBAN (شبا) for settlement |
| `ibanVerifiedAt` | `DateTime?` | Timestamp of last CBI IBAN verification |
| `nationalId` | `String?` | کد ملی (personal) or شناسه ملی (business) |
| `eNamadStatus` | `EnamadStatus` | eNamad trust-seal onboarding state (`none` default) |

None of these fields gate the development build. They are required before any
`Vendor` is approved for live payment processing in Phase 5.

## Consequences

- **Type safety at every enum boundary.** TypeScript will reject unknown status
  strings at compile time. Service actions no longer need runtime type assertions
  for enum values.
- **No more JSON.stringify/parse boilerplate** in application code for the
  affected columns.
- **Iran-correct defaults.** New vendors created without explicit overrides will
  default to IRR/fa/Asia/Tehran, not AED/en/Asia/Dubai.
- **Sequential, per-vendor orderNumbers.** Staff can reference orders by a
  human-readable `V-000042` instead of a timestamp fragment. The unique
  constraint prevents duplicate order numbers within a vendor.
- **Split-bill reviews work correctly.** Each payer can leave a review; no more
  constraint conflict.
- **Audit trail is in place** (schema only in this issue; population is Phase 3).
- **Sub-merchant onboarding fields are ready** for Phase 4/5 gateway integration.
- **SQLite ↔ Postgres portability.** Prisma handles enum-as-string for SQLite
  and native enums for Postgres transparently. The `Json` type maps to `TEXT` in
  SQLite and `JSONB` in Postgres — no application code changes required when
  switching providers.
- **Existing dev.db is incompatible** with the new schema. Run `bun run db:reset`
  to recreate the dev database. Production migrations require a proper
  `prisma migrate` with the backfill logic noted in §7.

## Testing

`src/lib/__tests__/schema-enums.test.ts` — 33 tests covering:
- Completeness and exclusion invariants for all enum value sets.
- Iran vendor defaults (currency, locale, timezone, VAT disabled).
- Type guards (`isValidOrderStatus`, `isValidPaymentStatus`, `isValidPaymentMethod`).
- `nextOrderNumber` pure function — formatting, padding, large sequence numbers,
  per-vendor partitioning.
- `AuditLogEntry` structural contract.

All 91 tests in the test suite pass.
