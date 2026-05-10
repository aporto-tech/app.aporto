CREATE TABLE "SkillRun" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "newApiUserId" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "skillId" INTEGER NOT NULL,
    "providerId" INTEGER,
    "skillCallId" INTEGER,
    "status" TEXT NOT NULL,
    "lifecycleMode" TEXT NOT NULL,
    "paramsHash" TEXT,
    "providerTaskId" TEXT,
    "providerStatusUrl" TEXT,
    "providerRaw" JSONB,
    "result" JSONB,
    "error" JSONB,
    "artifactJson" JSONB,
    "costUSD" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextPollAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkillRun_newApiUserId_createdAt_idx" ON "SkillRun"("newApiUserId", "createdAt" DESC);
CREATE INDEX "SkillRun_status_nextPollAt_idx" ON "SkillRun"("status", "nextPollAt");
CREATE INDEX "SkillRun_providerTaskId_idx" ON "SkillRun"("providerTaskId");
CREATE INDEX "SkillRun_newApiUserId_paramsHash_createdAt_idx" ON "SkillRun"("newApiUserId", "paramsHash", "createdAt");
