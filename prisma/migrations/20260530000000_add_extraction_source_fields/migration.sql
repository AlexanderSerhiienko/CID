-- AlterTable
ALTER TABLE "RiskEvent" ADD COLUMN "extractionSource" TEXT NOT NULL DEFAULT 'rules',
                        ADD COLUMN "aiEnhanced" BOOLEAN NOT NULL DEFAULT false,
                        ADD COLUMN "geocoderUsed" BOOLEAN NOT NULL DEFAULT false;
