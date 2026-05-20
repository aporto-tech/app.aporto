ALTER TABLE "Skill"
  ADD COLUMN IF NOT EXISTS "trialAvailable" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Skill_trialAvailable_idx"
  ON "Skill" ("trialAvailable");

CREATE TABLE IF NOT EXISTS "AnonymousSkillUsage" (
  id TEXT PRIMARY KEY,
  "anonymousClientId" TEXT,
  "ipHash" TEXT NOT NULL,
  "skillId" INTEGER,
  "runId" TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AnonymousSkillUsage_anonymousClientId_createdAt_idx"
  ON "AnonymousSkillUsage" ("anonymousClientId", "createdAt");

CREATE INDEX IF NOT EXISTS "AnonymousSkillUsage_ipHash_createdAt_idx"
  ON "AnonymousSkillUsage" ("ipHash", "createdAt");

CREATE INDEX IF NOT EXISTS "AnonymousSkillUsage_skillId_createdAt_idx"
  ON "AnonymousSkillUsage" ("skillId", "createdAt");
