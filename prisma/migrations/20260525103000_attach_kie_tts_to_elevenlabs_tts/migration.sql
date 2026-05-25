-- The KIE ElevenLabs Text-to-Speech providers were imported under music
-- generation skills, which kept Telegram routing from selecting
-- "ElevenLabs Text to Speech" when the user explicitly asked for KIE TTS.

UPDATE "Provider"
SET "skillId" = (
        SELECT id
        FROM "Skill"
        WHERE name = 'ElevenLabs Text to Speech'
        LIMIT 1
    ),
    "syncConfig" = (
        COALESCE("syncConfig"::jsonb, '{}'::jsonb)
        || jsonb_build_object(
            'inputMappings',
            COALESCE("syncConfig"::jsonb -> 'inputMappings', '{}'::jsonb)
            || jsonb_build_object('text', jsonb_build_array('prompt'))
        )
    )::text
WHERE name IN (
    'KIE - Elevenlabs Text to Speech, multilingual v2',
    'KIE - Elevenlabs Text to Speech, turbo 2.5'
)
AND EXISTS (
    SELECT 1
    FROM "Skill"
    WHERE name = 'ElevenLabs Text to Speech'
);
