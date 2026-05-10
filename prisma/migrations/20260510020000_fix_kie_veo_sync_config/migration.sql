UPDATE "Provider"
SET "syncConfig" = REPLACE("syncConfig", '"aspectRatio"', '"aspect_ratio"')
WHERE "syncConfig" IS NOT NULL
  AND "syncConfig" LIKE '%"/api/v1/veo/generate"%'
  AND "syncConfig" LIKE '%"aspectRatio"%';
