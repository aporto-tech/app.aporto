-- Add costPerChar to Provider for variable-cost skills (TTS, Sound Effects)
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "costPerChar" DOUBLE PRECISION;

-- Set per-char cost for TTS ElevenLabs provider (eleven_multilingual_v2 default)
UPDATE "Provider"
SET "costPerChar" = 0.00024,  -- $0.24 per 1K chars = $0.00024 per char
    "pricePerCall" = 0
WHERE name = 'ElevenLabs'
  AND "skillId" IN (SELECT id FROM "Skill" WHERE name = 'Text to Speech');
