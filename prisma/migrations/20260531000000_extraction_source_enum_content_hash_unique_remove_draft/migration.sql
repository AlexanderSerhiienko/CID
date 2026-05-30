-- Remove DRAFT from EventStatus enum
ALTER TABLE "RiskEvent" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('NEEDS_REVIEW', 'PUBLISHED', 'REJECTED');
ALTER TABLE "RiskEvent" ALTER COLUMN "status" TYPE "EventStatus" USING "status"::text::"EventStatus";
ALTER TABLE "RiskEvent" ALTER COLUMN "status" SET DEFAULT 'NEEDS_REVIEW';
DROP TYPE "EventStatus_old";

-- Create ExtractionSource enum and migrate extractionSource column
CREATE TYPE "ExtractionSource" AS ENUM ('RULES', 'AI', 'GEORSS');
ALTER TABLE "RiskEvent" ADD COLUMN "extractionSource_new" "ExtractionSource" NOT NULL DEFAULT 'RULES';
UPDATE "RiskEvent" SET "extractionSource_new" = CASE
  WHEN "extractionSource" = 'ai'     THEN 'AI'::"ExtractionSource"
  WHEN "extractionSource" = 'georss' THEN 'GEORSS'::"ExtractionSource"
  ELSE                                     'RULES'::"ExtractionSource"
END;
ALTER TABLE "RiskEvent" DROP COLUMN "extractionSource";
ALTER TABLE "RiskEvent" RENAME COLUMN "extractionSource_new" TO "extractionSource";

-- Add unique constraint on RawArticle.contentHash (drop old index first)
DROP INDEX IF EXISTS "RawArticle_contentHash_idx";
ALTER TABLE "RawArticle" ADD CONSTRAINT "RawArticle_contentHash_key" UNIQUE ("contentHash");
