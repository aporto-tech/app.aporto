CREATE TABLE IF NOT EXISTS "SkillDiscoveryLog" (
    id TEXT PRIMARY KEY,
    "newApiUserId" INTEGER NOT NULL,
    "tokenId" INTEGER,
    source TEXT NOT NULL,
    query TEXT NOT NULL,
    normalized TEXT NOT NULL,
    page INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    capability TEXT,
    "sessionId" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "topSkillIds" TEXT,
    "topSimilarity" DOUBLE PRECISION,
    "noResults" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    error TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SkillDiscoveryLog_createdAt_idx"
ON "SkillDiscoveryLog"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SkillDiscoveryLog_newApiUserId_createdAt_idx"
ON "SkillDiscoveryLog"("newApiUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SkillDiscoveryLog_noResults_createdAt_idx"
ON "SkillDiscoveryLog"("noResults", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SkillDiscoveryLog_normalized_idx"
ON "SkillDiscoveryLog"(normalized);
