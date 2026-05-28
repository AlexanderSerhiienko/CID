-- AlterTable
ALTER TABLE "RiskEvent" ADD COLUMN     "occurredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RiskEvent_occurredAt_idx" ON "RiskEvent"("occurredAt");
