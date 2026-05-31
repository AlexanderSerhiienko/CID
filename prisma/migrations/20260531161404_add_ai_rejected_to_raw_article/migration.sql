-- AlterTable
ALTER TABLE "RawArticle" ADD COLUMN     "aiRejected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "RawArticle_aiRejected_idx" ON "RawArticle"("aiRejected");
