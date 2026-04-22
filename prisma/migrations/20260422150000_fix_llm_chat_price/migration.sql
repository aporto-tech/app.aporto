-- Fix LLM Chat provider: billing is handled by New-API per token, not per call
UPDATE "Provider"
SET "pricePerCall" = 0
WHERE name = 'Aporto Gateway'
  AND "skillId" IN (SELECT id FROM "Skill" WHERE name = 'LLM Chat');
