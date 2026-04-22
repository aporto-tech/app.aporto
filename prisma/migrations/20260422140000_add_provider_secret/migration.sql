-- Provider: per-provider secret for outbound authentication.
-- When set, executeSkillViaProvider forwards "Bearer <providerSecret>" instead of
-- the caller's own Aporto API key — prevents credential leak to untrusted providers.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "providerSecret" TEXT;
