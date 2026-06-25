# ADR-0008 — Schema Modernization: Enums, JSONB, Iran Defaults, Translations, orderNumber, AuditLog

**Status:** Accepted  
**Date:** 2026-06-26  
**Addresses:** issue #8 (Schema modernization — enums, JSON, Iran defaults, translations, orderNumber, audit)

## Context

The pre-Postgres schema had several structural weaknesses that become correctness or operational problems at production scale:

1. **String "enums"**: statuses like `OrderStatus`, `PaymentStatus`, `StaffRole` were stored as plain `String` columns with no DB enforcement. Any string (including typos) could be written.
2. **JSON-as-String**: columns like `supportedLangs`, `tipPresets`, `tags`, `modifiers` were stored as `TEXT` JSON strings, preventing indexing and requiring parse/serialize on every access.
3. **UAE defaults**: `currency: "AED"`, `locale: "en"`, `timezone: "UTC"`, `country: "ae"` were the implicit defaults — wrong for an Iran product.
4. **No translation tables**: bilingual (FA/EN) menu content required separate API calls per locale with no enforced schema.
5. **`Date.now()` order numbers**: `orderNumber` was generated as `Q-${Date.now().toString().slice(-6)}-${nanoid(3)}` — not monotonic, not per-vendor, not collision-free under concurrent load, and not deterministically backfillable.
6. **No AuditLog**: admin mutations (price changes, order status updates, staff additions) had no traceable history.
7. **No sub-merchant fields**: KYC data (`nationalId`, `payoutIban`, `ibanVerifiedAt`), gateway tracking (`gatewaySubMerchantId`), and eNamad trust status (`eNamadStatus`) required separate tables or were absent.

## Decision

### Native Postgres enums (Prisma `enum`)

All status/type/role columns use native Prisma enums:

| Enum | Values |
|---|---|
| `EnamadStatus` | `none` `pending` `verified` `rejected` |
| `OrderStatus` | `open` `placed` `preparing` `ready` `served` `paid` `cancelled` |
| `OrderType` | `qsr` `dinein` |
| `OrderSource` | `qr` `pos` |
| `PaymentMethod` | `ipg` `cash` |
| `PaymentStatus` | `pending` `succeeded` `failed` `refunded` `expired` |
| `SplitType` | `full` `even` `items` `custom` |
| `StaffRole` | `superadmin` `owner` `manager` `staff` |
| `TableStatus` | `available` `occupied` `bill_requested` |

Postgres enforces these at the DB level; invalid values are rejected without reaching application code.

### Native `Json` columns (JSONB in Postgres)

All structured-data columns use `Json` in the Prisma schema, which maps to `JSONB` in Postgres:

- `Vendor.supportedLangs`, `Vendor.tipPresets`
- `Menu.availability`
- `MenuItem.tags`
- `OrderItem.modifiers`
- `Payment.splitMeta`
- `AuditLog.before`, `AuditLog.after`

`JSONB` is binary-encoded, indexable, and eliminates the parse/serialize boundary that plain `TEXT` required.

### Iran defaults on `Vendor`

All new `Vendor` rows default to Iranian settings:

- `country: "ir"`
- `currency: "IRR"`
- `locale: "fa"`
- `timezone: "Asia/Tehran"`
- `supportedLangs: ["fa", "en"]`
- `vatEnabled: false` (per-vendor VAT; default off pending Iranian accountant sign-off — see PRD §15)
- `vatPct: 0`

### Translation tables

Three translation models support bilingual (FA/EN) content:

- `MenuItemTranslation` — `(menuItemId, locale)` unique; fields: `name`, `description`
- `CategoryTranslation` — `(categoryId, locale)` unique; field: `name`
- `ModifierGroupTranslation` — `(modifierGroupId, locale)` unique; field: `name`

The parent models retain their primary-language `name`/`description` columns (Farsi by convention). English translations are stored in the translation tables. UI components query both and fall back to the primary field if a translation row is absent.

### Per-vendor monotonic `orderNumber`

`Vendor.vendorOrderSeq Int @default(0)` is an atomic counter. `nextVendorOrderNumber(vendorId)` increments it via a raw `UPDATE ... RETURNING` that is atomic in Postgres:

```sql
UPDATE "Vendor"
SET "vendorOrderSeq" = "vendorOrderSeq" + 1
WHERE "id" = $vendorId
RETURNING "vendorOrderSeq" AS seq
```

The result is formatted as `Q-000001`, `Q-000002`, etc. — monotonically increasing per vendor, zero-collision under concurrent load (Postgres `UPDATE` is row-level locked).

`Order` has `@@unique([vendorId, orderNumber])` to enforce DB-level uniqueness.

Migration `0002_order_number_backfill` backfills `vendorOrderSeq` from the largest numeric order number already in each vendor's order table, so the counter starts ahead of any existing data.

### `AuditLog` model

```prisma
model AuditLog {
  id        String    @id
  actorId   String        // StaffUser who made the change
  vendorId  String?       // null for platform-level actions
  action    String        // e.g. "update", "create", "delete"
  entity    String        // e.g. "MenuItem", "Order", "StaffUser"
  entityId  String
  before    Json?         // snapshot before mutation
  after     Json?         // snapshot after mutation
  at        DateTime  @default(now())
}
```

Indexed on `(actorId)`, `(vendorId)`, `(entity, entityId)`, `(at)`.

### Sub-merchant fields on `Vendor`

```prisma
gatewaySubMerchantId  String?       // assigned by payment facilitator on onboarding
payoutIban            String?       // validated IBAN (شبا) for settlement
ibanVerifiedAt        DateTime?     // set when CBI IBAN check passes
nationalId            String?       // کد ملی / شناسه ملی
eNamadStatus          EnamadStatus  @default(none)
```

These support the facilitator sub-merchant onboarding flow (PRD user story #26).

## Consequences

- **Correctness**: invalid enum values are DB-rejected; JSON columns are queryable.
- **Iran-first defaults**: new vendors are correctly configured for IRR/fa/Asia/Tehran without per-field overrides.
- **Bilingual readiness**: translation tables are in place for Phase 2 (i18n + design).
- **Order number safety**: concurrent order creation cannot produce duplicate `orderNumber` values for the same vendor.
- **Auditability**: all admin mutations can be logged with before/after diffs; required for PRD user story #30.
- **Sub-merchant onboarding**: KYC + IBAN + eNamad fields are ready for Phase 4 (payments).

## Migration strategy

1. `0001_baseline_postgres` — full schema including all changes above, applied via `prisma migrate resolve --applied` to the existing Neon instance.
2. `0002_order_number_backfill` — `UPDATE "Vendor" SET "vendorOrderSeq" = MAX(numeric_order_number)` — deterministic and idempotent.

## Runtime read/write conventions for native JSONB columns

With `Json` columns in Prisma on Postgres, the Prisma client deserialises JSONB
on read and serialises on write automatically. Callers **must not**:

- Call `JSON.parse(value as string)` on a column returned by Prisma — doing so
  calls `JSON.parse` on an already-parsed array/object, which throws and causes
  silent fallback to wrong defaults (e.g. the AED-era tip presets `[10,15,20]`
  instead of `[5,10,15]`).
- Call `JSON.stringify(value)` before passing to a Prisma write — doing so
  stores a JSON string literal inside JSONB (e.g. `"[5,10,15]"`) rather than
  the array.

The correct pattern for reads:

```ts
const tipPresets = Array.isArray(vendor.tipPresets)
  ? (vendor.tipPresets as number[])
  : [5, 10, 15];
```

The correct pattern for writes:

```ts
await db.vendor.update({ data: { tipPresets } }); // pass the array directly
```

## @default(cuid()) on id fields

`AuditLog`, `CategoryTranslation`, `MenuItemTranslation`, and
`ModifierGroupTranslation` all use `@id @default(cuid())`. This is a Prisma
client-side default (no Postgres `DEFAULT` expression in the migration SQL).
Omitting it would require callers to supply an explicit `id` on every insert.

## References

- Issue #8 — implementation (round 2 review fixes)
- PRD issue #1, §5 (Data model), user stories #14, #18, #23, #26, #30
- ADR-0007 — Review per-Payment
- ADR-0002 — Integer-rial money model
