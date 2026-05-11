-- Make KIE media skills discoverable by user-facing model names and by MCP
-- capability filters such as capability="generate".

UPDATE "Skill"
SET capabilities = (
        SELECT jsonb_agg(DISTINCT value)::text
        FROM jsonb_array_elements_text(
            CASE
                WHEN capabilities IS NULL OR capabilities = '' THEN '[]'::jsonb
                ELSE capabilities::jsonb
            END || '["generate"]'::jsonb
        ) AS value
    )
WHERE category IN ('media/image', 'media/video', 'media/music')
  AND capabilities::text LIKE '%create-media%';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana 2 4K',
    tags = '["kie","image","google","image-generation","nano","banana","2","nano-banana","nano-banana-2","4k"]',
    description = regexp_replace(description, '^Google Image Generation 2 4K', 'Image Generation Nano Banana 2 4K')
WHERE id = 94
  AND name = 'Google Image Generation 2 4K';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana 2 2K',
    tags = '["kie","image","google","image-generation","nano","banana","2","nano-banana","nano-banana-2","2k"]',
    description = regexp_replace(description, '^Google Image Generation 2 2K', 'Image Generation Nano Banana 2 2K')
WHERE id = 95
  AND name = 'Google Image Generation 2 2K';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana 2 1K',
    tags = '["kie","image","google","image-generation","nano","banana","2","nano-banana","nano-banana-2","1k"]',
    description = regexp_replace(description, '^Google Image Generation 2 1K', 'Image Generation Nano Banana 2 1K')
WHERE id = 96
  AND name = 'Google Image Generation 2 1K';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana Pro 2K',
    tags = '["kie","image","google","image-generation","nano","banana","pro","nano-banana","nano-banana-pro","2k"]',
    description = regexp_replace(description, '^Google Image Generation 1 2K Pro', 'Image Generation Nano Banana Pro 2K')
WHERE id = 146
  AND name = 'Google Image Generation 1 2K Pro';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana Pro 4K',
    tags = '["kie","image","google","image-generation","nano","banana","pro","nano-banana","nano-banana-pro","4k"]',
    description = regexp_replace(description, '^Google Image Generation 4K Pro', 'Image Generation Nano Banana Pro 4K')
WHERE id = 147
  AND name = 'Google Image Generation 4K Pro';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana Text-to-Image',
    tags = '["kie","image","google","text-to-image","nano","banana","nano-banana"]',
    description = regexp_replace(description, '^Google Text-to-Image', 'Image Generation Nano Banana Text-to-Image')
WHERE id = 248
  AND name = 'Google Text-to-Image';

UPDATE "Skill"
SET name = 'Image Generation Nano Banana Image-to-Image',
    tags = '["kie","image","google","image-to-image","nano","banana","nano-banana","edit"]',
    description = regexp_replace(description, '^Google Image-to-Image', 'Image Generation Nano Banana Image-to-Image')
WHERE id = 249
  AND name = 'Google Image-to-Image';

UPDATE "Skill"
SET name = 'Sora 2 Stable Text-to-Video Generation 10s',
    tags = '["kie","video","sora","2","sora-2","text-to-video","stable","10s"]',
    description = regexp_replace(description, '^Sora Text-to-Video 2 10s Stable', 'Sora 2 Stable Text-to-Video Generation 10s')
WHERE id = 161
  AND name = 'Sora Text-to-Video 2 10s Stable';

UPDATE "Skill"
SET name = 'Sora 2 Stable Text-to-Video Generation 15s',
    tags = '["kie","video","sora","2","sora-2","text-to-video","stable","15s"]',
    description = regexp_replace(description, '^Sora Text-to-Video 2 15s Stable', 'Sora 2 Stable Text-to-Video Generation 15s')
WHERE id = 106
  AND name = 'Sora Text-to-Video 2 15s Stable';

UPDATE "Skill"
SET name = 'Sora 2 Fast Text-to-Video Generation 10s',
    tags = '["kie","video","sora","2","sora-2","text-to-video","fast","standard","10s"]',
    description = regexp_replace(description, '^Sora Text-to-Video 2 10s', 'Sora 2 Fast Text-to-Video Generation 10s')
WHERE id = 165
  AND name = 'Sora Text-to-Video 2 10s';

UPDATE "Skill"
SET name = 'Sora 2 Fast Text-to-Video Generation 15s',
    tags = '["kie","video","sora","2","sora-2","text-to-video","fast","standard","15s"]',
    description = regexp_replace(description, '^Sora Text-to-Video 2 15s', 'Sora 2 Fast Text-to-Video Generation 15s')
WHERE id = 163
  AND name = 'Sora Text-to-Video 2 15s';
