-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable: Skill
CREATE TABLE "Skill" (
    "id"           SERIAL NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT NOT NULL,
    "paramsSchema" TEXT,
    "tags"         TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "publishedBy"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- Add pgvector column (hand-patched — Prisma generates empty body for Unsupported())
ALTER TABLE "Skill" ADD COLUMN "embedding" vector(1536);

-- ivfflat index for cosine similarity (required for sub-200ms discovery)
-- lists=100 is appropriate for up to ~1M rows; revisit at scale
CREATE INDEX "Skill_embedding_ivfflat_idx"
    ON "Skill" USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);

-- CreateTable: Provider
CREATE TABLE "Provider" (
    "id"           SERIAL NOT NULL,
    "skillId"      INTEGER NOT NULL,
    "name"         TEXT NOT NULL,
    "endpoint"     TEXT NOT NULL,
    "pricePerCall" DOUBLE PRECISION NOT NULL,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 500,
    "retryRate"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SkillCall
CREATE TABLE "SkillCall" (
    "id"           SERIAL NOT NULL,
    "sessionId"    TEXT NOT NULL,
    "newApiUserId" INTEGER NOT NULL,
    "skillId"      INTEGER NOT NULL,
    "providerId"   INTEGER NOT NULL,
    "isRetry"      BOOLEAN NOT NULL DEFAULT false,
    "latencyMs"    INTEGER,
    "success"      BOOLEAN,
    "costUSD"      DOUBLE PRECISION,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PublisherWaitlist
CREATE TABLE "PublisherWaitlist" (
    "id"        SERIAL NOT NULL,
    "email"     TEXT NOT NULL,
    "name"      TEXT,
    "useCase"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved"  BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PublisherWaitlist_pkey" PRIMARY KEY ("id")
);

-- Unique constraint
CREATE UNIQUE INDEX "PublisherWaitlist_email_key" ON "PublisherWaitlist"("email");

-- Foreign keys
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillCall" ADD CONSTRAINT "SkillCall_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillCall" ADD CONSTRAINT "SkillCall_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "SkillCall_sessionId_newApiUserId_createdAt_idx"
    ON "SkillCall"("sessionId", "newApiUserId", "createdAt");

CREATE INDEX "SkillCall_newApiUserId_idx" ON "SkillCall"("newApiUserId");
