-- Migration 0002: Deterministic orderNumber backfill
-- Purpose: populate Vendor.vendorOrderSeq from existing orders so the
--          per-vendor monotonic counter is in sync with pre-existing data.
--
-- The counter represents the highest orderNumber yet assigned for each vendor.
-- New orders will increment the counter atomically via SELECT ... FOR UPDATE
-- (see orders.ts nextVendorOrderNumber) before inserting. This migration
-- ensures that counter starts at or above all pre-existing order numbers,
-- preventing future collisions with seed / legacy data.
--
-- The approach:
--   1. Parse the numeric part from existing orderNumber strings.
--      Seed-format orders look like "Q-10240", "Q-10241" etc.
--      Any order whose number cannot be parsed as an integer is treated as 0.
--   2. For each vendor, set vendorOrderSeq = MAX(parsed_order_num) or 0 when
--      no numeric orders exist. This is deterministic and idempotent:
--      running this migration a second time produces the same result.

UPDATE "Vendor" v
SET "vendorOrderSeq" = COALESCE(
  (
    SELECT MAX(
      CASE
        WHEN o."orderNumber" ~ '^Q-[0-9]+$'
          THEN CAST(SUBSTRING(o."orderNumber" FROM 3) AS INTEGER)
        WHEN o."orderNumber" ~ '^[0-9]+$'
          THEN CAST(o."orderNumber" AS INTEGER)
        ELSE 0
      END
    )
    FROM "Order" o
    WHERE o."vendorId" = v."id"
  ),
  0
);
