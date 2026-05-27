-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'OPEN_DATA', 'OFFICIAL_FEED', 'NEWS');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('DISEASE_OUTBREAK', 'NATURAL_DISASTER', 'CYBER_ATTACK', 'TRANSPORT_DISRUPTION', 'POLITICAL_UNREST', 'FOOD_SAFETY_ALERT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SourceType" NOT NULL DEFAULT 'RSS',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawArticle" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "riskEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL DEFAULT 'UNKNOWN',
    "country" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severity" "Severity" NOT NULL DEFAULT 'LOW',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "EventStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_url_key" ON "Source"("url");

-- CreateIndex
CREATE INDEX "Source_enabled_idx" ON "Source"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "RawArticle_url_key" ON "RawArticle"("url");

-- CreateIndex
CREATE INDEX "RawArticle_sourceId_idx" ON "RawArticle"("sourceId");

-- CreateIndex
CREATE INDEX "RawArticle_contentHash_idx" ON "RawArticle"("contentHash");

-- CreateIndex
CREATE INDEX "RawArticle_publishedAt_idx" ON "RawArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_category_idx" ON "RiskEvent"("category");

-- CreateIndex
CREATE INDEX "RiskEvent_country_city_idx" ON "RiskEvent"("country", "city");

-- CreateIndex
CREATE INDEX "RiskEvent_severity_idx" ON "RiskEvent"("severity");

-- CreateIndex
CREATE INDEX "RiskEvent_status_idx" ON "RiskEvent"("status");

-- CreateIndex
CREATE INDEX "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "RawArticle" ADD CONSTRAINT "RawArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawArticle" ADD CONSTRAINT "RawArticle_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "RiskEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
