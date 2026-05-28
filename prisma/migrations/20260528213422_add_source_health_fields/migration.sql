-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastIngestedAt" TIMESTAMP(3);
