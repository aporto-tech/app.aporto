UPDATE "Provider"
SET "isActive" = false
WHERE name IN ('fal.ai flux-schnell', 'fal.ai flux-dev', 'fal.ai flux-pro')
  AND endpoint = 'https://app.aporto.tech/api/providers/image';
