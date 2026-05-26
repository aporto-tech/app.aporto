UPDATE "Provider"
SET "isActive" = false,
    "updatedAt" = NOW()
WHERE name IN ('fal.ai flux-schnell', 'fal.ai flux-dev', 'fal.ai flux-pro')
  AND endpoint = 'https://app.aporto.tech/api/providers/image';
