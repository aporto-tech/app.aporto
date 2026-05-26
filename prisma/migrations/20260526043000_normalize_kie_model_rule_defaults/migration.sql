UPDATE "Provider"
SET "syncConfig" = jsonb_set(
    "syncConfig"::jsonb,
    '{inputDefaults}',
    ("syncConfig"::jsonb -> 'inputDefaults') - 'num_images',
    true
)::text
WHERE endpoint = 'https://app.aporto.tech/api/providers/kie'
  AND "syncConfig" IS NOT NULL
  AND "syncConfig"::jsonb ->> 'model' IN ('nano-banana-2', 'nano-banana-pro')
  AND "syncConfig"::jsonb -> 'inputDefaults' ? 'num_images';
