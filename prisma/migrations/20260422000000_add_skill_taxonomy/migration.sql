-- Add taxonomy columns to Skill
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "category"     TEXT;
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "capabilities" TEXT;
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "inputTypes"   TEXT;
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "outputTypes"  TEXT;

-- Index on category for filtered discovery queries
CREATE INDEX IF NOT EXISTS "Skill_category_idx" ON "Skill"("category");
