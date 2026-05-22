UPDATE "Provider"
SET "syncConfig" = jsonb_set(
        "syncConfig"::jsonb,
        '{model}',
        '"google/nano-banana-pro"'::jsonb,
        true
    )::text
WHERE endpoint = 'https://app.aporto.tech/api/providers/kie'
  AND "syncConfig" IS NOT NULL
  AND "syncConfig"::jsonb ->> 'model' = '1/2k'
  AND name ILIKE '%nano banana pro%';
