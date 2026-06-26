-- CreateTable: OpsQueueEntry — durable ops queue for ambiguous sweep payments (PRD §6.7)
CREATE TABLE "OpsQueueEntry" (
    "id"          TEXT NOT NULL,
    "paymentId"   TEXT NOT NULL,
    "orderId"     TEXT NOT NULL,
    "vendorId"    TEXT NOT NULL,
    "reason"      TEXT NOT NULL,
    "resolvedAt"  TIMESTAMP(3),
    "inquiredAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsQueueEntry_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "OpsQueueEntry_paymentId_idx" ON "OpsQueueEntry"("paymentId");
CREATE INDEX "OpsQueueEntry_vendorId_idx" ON "OpsQueueEntry"("vendorId");
CREATE INDEX "OpsQueueEntry_resolvedAt_idx" ON "OpsQueueEntry"("resolvedAt");
