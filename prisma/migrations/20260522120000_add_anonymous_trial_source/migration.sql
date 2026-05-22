ALTER TABLE "AnonymousSkillUsage"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'cli',
  ADD COLUMN IF NOT EXISTS "externalUserId" TEXT;

CREATE INDEX IF NOT EXISTS "AnonymousSkillUsage_source_externalUserId_createdAt_idx"
  ON "AnonymousSkillUsage" ("source", "externalUserId", "createdAt");
