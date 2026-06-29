-- Replace signed-JWT tableToken with short opaque publicId (8-char Crockford base32)
-- Addresses issue #50: shorter, print-friendly QR codes without HMAC overhead.

-- Step 1: Add publicId column (nullable to allow backfill of existing rows)
ALTER TABLE "DiningTable" ADD COLUMN "publicId" TEXT;

-- Step 2: Backfill existing rows with generated Crockford base32 codes.
-- Randomness comes from gen_random_uuid() (core Postgres since 13, no extension
-- required) decoded to its 16 raw bytes; the first 5 bytes give 40 bits = 8 × 5-bit
-- groups, matching the Crockford base32 character count. Avoiding pgcrypto's
-- gen_random_bytes() sidesteps a same-transaction extension-visibility failure on
-- Neon. The DO block retries on collision (extremely unlikely with 2^40 ≈ 1.1
-- trillion possible codes). The loop variable is gen_code to avoid colliding with
-- the existing DiningTable.code column (ambiguous-reference error 42702).
DO $$
DECLARE
  alpha CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  t_rec    RECORD;
  gen_code TEXT;
  b        BYTEA;
  n        BIGINT;
BEGIN
  FOR t_rec IN SELECT id FROM "DiningTable" LOOP
    LOOP
      b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      n := (get_byte(b, 0)::bigint << 32) |
           (get_byte(b, 1)::bigint << 24) |
           (get_byte(b, 2)::bigint << 16) |
           (get_byte(b, 3)::bigint << 8)  |
            get_byte(b, 4)::bigint;
      gen_code := substr(alpha, ((n >> 35) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 30) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 25) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 20) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 15) & 31)::int + 1, 1) ||
              substr(alpha, ((n >> 10) & 31)::int + 1, 1) ||
              substr(alpha, ((n >>  5) & 31)::int + 1, 1) ||
              substr(alpha, ( n        & 31)::int + 1, 1);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "DiningTable" WHERE "publicId" = gen_code
      );
    END LOOP;
    UPDATE "DiningTable" SET "publicId" = gen_code WHERE id = t_rec.id;
  END LOOP;
END $$;

-- Step 3: Enforce NOT NULL and add the globally unique constraint
ALTER TABLE "DiningTable" ALTER COLUMN "publicId" SET NOT NULL;
CREATE UNIQUE INDEX "DiningTable_publicId_key" ON "DiningTable"("publicId");

-- Step 4: Drop the now-dead tableToken column (replaced by publicId)
ALTER TABLE "DiningTable" DROP COLUMN IF EXISTS "tableToken";
