-- Replace signed-JWT tableToken with short opaque publicId (8-char Crockford base32)
-- Addresses issue #50: shorter, print-friendly QR codes without HMAC overhead.

-- gen_random_bytes is provided by pgcrypto (not available by default in all Postgres
-- installations, including Neon). Enable it idempotently before the backfill DO block.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add publicId column (nullable to allow backfill of existing rows)
ALTER TABLE "DiningTable" ADD COLUMN "publicId" TEXT;

-- Step 2: Backfill existing rows with generated Crockford base32 codes.
-- gen_random_bytes(5) produces 40 bits = 8 × 5-bit groups, matching the
-- Crockford base32 character count. The DO block retries on collision (extremely
-- unlikely in practice with 2^40 ≈ 1.1 trillion possible codes).
DO $$
DECLARE
  alpha CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  t_rec   RECORD;
  code    TEXT;
  b       BYTEA;
  n       BIGINT;
BEGIN
  FOR t_rec IN SELECT id FROM "DiningTable" LOOP
    LOOP
      b := gen_random_bytes(5);
      n := (get_byte(b, 0)::bigint << 32) |
           (get_byte(b, 1)::bigint << 24) |
           (get_byte(b, 2)::bigint << 16) |
           (get_byte(b, 3)::bigint << 8)  |
            get_byte(b, 4)::bigint;
      code := substr(alpha, ((n >> 35) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 30) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 25) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 20) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 15) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 10) & 31)::int + 1, 1) ||
              substr(alpha, ((n >>  5) & 31)::int + 1, 1) ||
              substr(alpha, ( n        & 31)::int + 1, 1);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "DiningTable" WHERE "publicId" = code
      );
    END LOOP;
    UPDATE "DiningTable" SET "publicId" = code WHERE id = t_rec.id;
  END LOOP;
END $$;

-- Step 3: Enforce NOT NULL and add the globally unique constraint
ALTER TABLE "DiningTable" ALTER COLUMN "publicId" SET NOT NULL;
CREATE UNIQUE INDEX "DiningTable_publicId_key" ON "DiningTable"("publicId");

-- Step 4: Drop the now-dead tableToken column (replaced by publicId)
ALTER TABLE "DiningTable" DROP COLUMN IF EXISTS "tableToken";
