-- Align direct ElevenLabs Text-to-Speech billing with KIE pricing.
-- KIE source rates:
--   turbo 2.5: $0.03 / 1K characters
--   multilingual v2: $0.06 / 1K characters
--   v3 / text-to-dialogue: $0.07 / 1K characters

WITH pricing AS (
  SELECT *
  FROM (VALUES
    ('ElevenLabs eleven_flash_v2_5', 'eleven_flash_v2_5', 0.00003::double precision, 'Elevenlabs Text to Speech, flash 2.5 (priced as KIE turbo 2.5)', '6.0', '0.03'),
    ('ElevenLabs eleven_turbo_v2_5', 'eleven_turbo_v2_5', 0.00003::double precision, 'Elevenlabs Text to Speech, turbo 2.5', '6.0', '0.03'),
    ('ElevenLabs eleven_multilingual_v2', 'eleven_multilingual_v2', 0.00006::double precision, 'Elevenlabs Text to Speech, multilingual v2', '12.0', '0.06'),
    ('ElevenLabs eleven_v3', 'eleven_v3', 0.00007::double precision, 'Elevenlabs V3 / Text to dialogue equivalent', '14', '0.07')
  ) AS p(provider_name, model_id, cost_per_char, model_description, credit_price, usd_price)
)
UPDATE "Provider" provider
SET "pricePerCall" = 0,
    "costPerChar" = pricing.cost_per_char,
    "syncConfig" = (
      COALESCE(provider."syncConfig"::jsonb, '{}'::jsonb)
      || jsonb_build_object(
        'model_id', pricing.model_id,
        'pricing',
        COALESCE(provider."syncConfig"::jsonb -> 'pricing', '{}'::jsonb)
        || jsonb_build_object(
          'modelDescription', pricing.model_description,
          'provider', 'Elevenlabs',
          'creditPrice', pricing.credit_price,
          'creditUnit', 'per 1000 characters',
          'usdPrice', pricing.usd_price,
          'pricePerCall', 0,
          'costPerChar', pricing.cost_per_char,
          'source', 'https://kie.ai/pricing'
        )
      )
    )::text
FROM pricing
WHERE provider.name = pricing.provider_name;

UPDATE "Skill"
SET description = 'Convert text to natural-sounding speech using ElevenLabs. Returns a URL to the generated MP3 audio. Pricing aligned to KIE rates: flash/turbo v2.5 ($0.03/1K chars), multilingual v2 ($0.06/1K), eleven_v3 ($0.07/1K).',
    "paramsSchema" = '{"text":"string (max 5000 chars)","voice_id":"string (ElevenLabs voice ID, default: Rachel)","model_id":"string (eleven_multilingual_v2|eleven_flash_v2_5|eleven_turbo_v2_5|eleven_v3, default: provider model)","output_format":"string (default: mp3_44100_128)"}'
WHERE name IN ('Text to Speech', 'ElevenLabs Text to Speech');
