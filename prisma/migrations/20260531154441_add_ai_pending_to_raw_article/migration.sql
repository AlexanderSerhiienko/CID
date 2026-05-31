/*
  Warnings:

  - The `extractionSource` column on the `RiskEvent` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "RawArticle" ADD COLUMN     "aiPending" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RiskEvent" DROP COLUMN "extractionSource",
ADD COLUMN     "extractionSource" TEXT NOT NULL DEFAULT 'rules';

-- DropEnum
DROP TYPE "ExtractionSource";

-- CreateIndex
CREATE INDEX "RawArticle_aiPending_idx" ON "RawArticle"("aiPending");
