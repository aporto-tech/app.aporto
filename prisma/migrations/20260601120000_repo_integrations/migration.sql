-- Repository integration attribution for SDK/CLI/MCP usage.

CREATE TABLE "RepoIntegration" (
    "id"           TEXT NOT NULL,
    "publisherId"  TEXT NOT NULL,
    "publicId"     TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "repoUrl"      TEXT,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "revenueShare" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepoIntegration_publicId_key" ON "RepoIntegration"("publicId");
CREATE INDEX "RepoIntegration_publisherId_idx" ON "RepoIntegration"("publisherId");
CREATE INDEX "RepoIntegration_status_idx" ON "RepoIntegration"("status");

ALTER TABLE "RepoIntegration"
    ADD CONSTRAINT "RepoIntegration_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RepoIntegrationRevenue" (
    "id"              TEXT NOT NULL,
    "integrationId"   TEXT NOT NULL,
    "newApiUserId"    INTEGER NOT NULL,
    "requestId"       TEXT,
    "skillCallId"     INTEGER,
    "skillRunId"      TEXT,
    "model"           TEXT,
    "grossUSD"        DOUBLE PRECISION NOT NULL,
    "providerCostUSD" DOUBLE PRECISION,
    "netUSD"          DOUBLE PRECISION,
    "revenueShare"    DOUBLE PRECISION NOT NULL,
    "earningUSD"      DOUBLE PRECISION NOT NULL,
    "paidOut"         BOOLEAN NOT NULL DEFAULT false,
    "paidOutAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoIntegrationRevenue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepoIntegrationRevenue_integrationId_createdAt_idx" ON "RepoIntegrationRevenue"("integrationId", "createdAt" DESC);
CREATE INDEX "RepoIntegrationRevenue_integrationId_paidOut_idx" ON "RepoIntegrationRevenue"("integrationId", "paidOut");
CREATE INDEX "RepoIntegrationRevenue_newApiUserId_createdAt_idx" ON "RepoIntegrationRevenue"("newApiUserId", "createdAt" DESC);
CREATE UNIQUE INDEX "RepoIntegrationRevenue_requestId_key"
    ON "RepoIntegrationRevenue"("requestId")
    WHERE "requestId" IS NOT NULL;
CREATE UNIQUE INDEX "RepoIntegrationRevenue_skillCallId_key"
    ON "RepoIntegrationRevenue"("skillCallId")
    WHERE "skillCallId" IS NOT NULL;
CREATE UNIQUE INDEX "RepoIntegrationRevenue_skillRunId_key"
    ON "RepoIntegrationRevenue"("skillRunId")
    WHERE "skillRunId" IS NOT NULL;

ALTER TABLE "RepoIntegrationRevenue"
    ADD CONSTRAINT "RepoIntegrationRevenue_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "RepoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillRun"
    ADD COLUMN IF NOT EXISTS "integrationPublicId" TEXT;

CREATE INDEX IF NOT EXISTS "SkillRun_integrationPublicId_idx" ON "SkillRun"("integrationPublicId");
