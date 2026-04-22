-- CreateTable: Publisher
CREATE TABLE "Publisher" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "displayName"     TEXT NOT NULL,
    "website"         TEXT,
    "description"     TEXT,
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "approvedAt"      TIMESTAMP(3),
    "approvedBy"      TEXT,
    "revenueShare"    DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "stripeAccountId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publisher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Publisher_userId_key" ON "Publisher"("userId");
CREATE INDEX "Publisher_status_idx" ON "Publisher"("status");

-- CreateTable: PublisherApiKey
CREATE TABLE "PublisherApiKey" (
    "id"          TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "lookupHash"  TEXT NOT NULL,
    "keyHmac"     TEXT NOT NULL,
    "prefix"      TEXT NOT NULL,
    "lastUsedAt"  TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublisherApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublisherApiKey_lookupHash_key" ON "PublisherApiKey"("lookupHash");
CREATE INDEX "PublisherApiKey_publisherId_idx" ON "PublisherApiKey"("publisherId");

-- AddColumn: Skill — publisher FK + status + lifecycle fields
ALTER TABLE "Skill"
    ADD COLUMN IF NOT EXISTS "publisherId"  TEXT,
    ADD COLUMN IF NOT EXISTS "status"       TEXT NOT NULL DEFAULT 'live',
    ADD COLUMN IF NOT EXISTS "reviewNote"   TEXT,
    ADD COLUMN IF NOT EXISTS "lastEditedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "inputSchema"  TEXT,
    ADD COLUMN IF NOT EXISTS "mcpVersion"   TEXT;

-- Drop old publishedBy column (was always NULL for existing skills)
ALTER TABLE "Skill" DROP COLUMN IF EXISTS "publishedBy";

-- Backfill: all existing Aporto-internal skills are live
UPDATE "Skill" SET "status" = 'live' WHERE "status" = 'live';  -- no-op, default covers it

CREATE INDEX IF NOT EXISTS "Skill_status_idx" ON "Skill"("status");
CREATE INDEX IF NOT EXISTS "Skill_publisherId_idx" ON "Skill"("publisherId");

-- CreateTable: SkillRevenue
CREATE TABLE "SkillRevenue" (
    "id"                  TEXT NOT NULL,
    "skillId"             INTEGER NOT NULL,
    "publisherId"         TEXT NOT NULL,
    "skillCallId"         INTEGER NOT NULL,
    "grossUSD"            DOUBLE PRECISION NOT NULL,
    "revenueShare"        DOUBLE PRECISION NOT NULL,
    "publisherEarningUSD" DOUBLE PRECISION NOT NULL,
    "paidOut"             BOOLEAN NOT NULL DEFAULT false,
    "paidOutAt"           TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillRevenue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkillRevenue_skillCallId_key" ON "SkillRevenue"("skillCallId");
CREATE INDEX "SkillRevenue_publisherId_paidOut_idx" ON "SkillRevenue"("publisherId", "paidOut");
CREATE INDEX "SkillRevenue_publisherId_createdAt_idx" ON "SkillRevenue"("publisherId", "createdAt" DESC);

-- AddForeignKey constraints
ALTER TABLE "Publisher"
    ADD CONSTRAINT "Publisher_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublisherApiKey"
    ADD CONSTRAINT "PublisherApiKey_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Skill"
    ADD CONSTRAINT "Skill_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SkillRevenue"
    ADD CONSTRAINT "SkillRevenue_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillRevenue"
    ADD CONSTRAINT "SkillRevenue_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillRevenue"
    ADD CONSTRAINT "SkillRevenue_skillCallId_fkey"
    FOREIGN KEY ("skillCallId") REFERENCES "SkillCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
