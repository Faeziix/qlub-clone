-- AlterTable: add destinationIban to WalletTransaction for auditable payout destination (AC4)
ALTER TABLE "WalletTransaction" ADD COLUMN "destinationIban" TEXT;
