UPDATE "Provider"
SET "isActive" = false
WHERE id IN (1424, 1426)
  AND endpoint = 'https://app.aporto.tech/api/providers/kie'
  AND "skillId" = 248
  AND name ILIKE '%imagen4%';
