-- AlterTable
ALTER TABLE "RiskEvent" ADD COLUMN     "signals" JSONB NOT NULL DEFAULT '[]';
