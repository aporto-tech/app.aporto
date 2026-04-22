-- Provider: separate timeout tracking (distinct from general retryRate)
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "timeoutRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- SkillCall: params hash for retry detection + error classification
ALTER TABLE "SkillCall" ADD COLUMN IF NOT EXISTS "paramsHash" TEXT;
ALTER TABLE "SkillCall" ADD COLUMN IF NOT EXISTS "errorType"  TEXT;
-- errorType values: "success" | "timeout" | "network_error" | "error_5xx" | "error_4xx"

-- Index for retry-detection query (2-min window): (userId, paramsHash, createdAt)
CREATE INDEX IF NOT EXISTS "SkillCall_params_retry_idx"
  ON "SkillCall" ("newApiUserId", "paramsHash", "createdAt");

-- Index for stats queries ordered by time
CREATE INDEX IF NOT EXISTS "SkillCall_createdAt_idx"
  ON "SkillCall" ("createdAt" DESC);

-- Update session-based exclusion index to include skillId for selectProvider CTE
DROP INDEX IF EXISTS "SkillCall_sessionId_newApiUserId_createdAt_idx";
CREATE INDEX IF NOT EXISTS "SkillCall_session_skill_idx"
  ON "SkillCall" ("sessionId", "newApiUserId", "skillId", "createdAt");
