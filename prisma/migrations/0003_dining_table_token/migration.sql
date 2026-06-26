-- AddColumn tableToken to DiningTable
-- Stores a signed JWT (HMAC-SHA256) embedding vendorId + tableId.
-- Nullable so that existing rows are not invalidated; tokens are generated
-- on table creation and can be back-filled for existing tables via a seed/
-- admin script when needed.

ALTER TABLE "DiningTable" ADD COLUMN "tableToken" TEXT;
