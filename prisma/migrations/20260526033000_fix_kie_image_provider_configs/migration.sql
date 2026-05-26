UPDATE "Provider"
SET "syncConfig" = (
    jsonb_set(
        ("syncConfig"::jsonb - 'inputDefaults')::jsonb,
        '{inputDefaults}',
        jsonb_build_object(
            'quality',
            CASE
                WHEN lower(name) LIKE '%medium%' THEN 'medium'
                ELSE 'high'
            END,
            'aspect_ratio',
            COALESCE("syncConfig"::jsonb #>> '{inputDefaults,aspect_ratio}', '1:1')
        ),
        true
    )
)::text
WHERE endpoint = 'https://app.aporto.tech/api/providers/kie'
  AND "syncConfig" IS NOT NULL
  AND "syncConfig"::jsonb ->> 'model' IN ('gpt-image/1.5-text-to-image', 'gpt-image/1.5-image-to-image');

UPDATE "Provider"
SET "syncConfig" = (
    jsonb_set(
        jsonb_set(
            "syncConfig"::jsonb,
            '{model}',
            '"nano-banana-pro"'::jsonb,
            true
        ) - 'inputDefaults',
        '{inputDefaults}',
        jsonb_build_object(
            'image_input',
            '[]'::jsonb,
            'aspect_ratio',
            COALESCE("syncConfig"::jsonb #>> '{inputDefaults,aspect_ratio}', '1:1'),
            'resolution',
            CASE
                WHEN lower(name) LIKE '%4k%' THEN '4K'
                ELSE '2K'
            END,
            'output_format',
            'png'
        ),
        true
    )
)::text
WHERE endpoint = 'https://app.aporto.tech/api/providers/kie'
  AND "syncConfig" IS NOT NULL
  AND "syncConfig"::jsonb ->> 'model' = 'google/nano-banana-pro';
