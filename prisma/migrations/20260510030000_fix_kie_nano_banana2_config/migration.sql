UPDATE "Provider"
SET "syncConfig" = jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    "syncConfig"::jsonb,
                    '{model}',
                    '"nano-banana-2"'::jsonb,
                    true
                ),
                '{inputDefaults,resolution}',
                to_jsonb(upper(("syncConfig"::jsonb #>> '{inputDefaults,quality}'))),
                true
            ),
            '{inputDefaults,output_format}',
            '"png"'::jsonb,
            true
        ),
        '{inputDefaults,image_input}',
        '[]'::jsonb,
        true
    )::text
WHERE "syncConfig" IS NOT NULL
  AND "syncConfig"::jsonb ->> 'model' = 'google/nano-banana-2';
