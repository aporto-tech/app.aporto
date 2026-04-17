-- ============================================================
-- Conquest Map Setup
-- Run ONCE in Supabase SQL Editor. Idempotent.
--
-- What this does:
--   1. Creates conquest_seed_owners (Dark Lord faction data)
--   2. Creates conquest_province_state (fog-of-war tracking)
--   3. Creates index on logs for conquest queries
--   4. Creates materialized view conquest_current_owners (24h rolling)
--   5. Sets up pg_cron to refresh view every 5 minutes
--   6. Seeds Dark Lord factions for all major model providers
--
-- Requirements:
--   Supabase: Database → Extensions → enable "pg_cron"
-- ============================================================


-- ============================================================
-- STEP 1: Create tables
-- ============================================================

CREATE TABLE IF NOT EXISTS conquest_seed_owners (
    model_id      TEXT     PRIMARY KEY,
    faction_name  TEXT     NOT NULL,
    faction_type  TEXT     NOT NULL DEFAULT 'dark_lord',  -- 'dark_lord' | 'founding_keep'
    capturable    BOOLEAN  NOT NULL DEFAULT true
);

-- Fog-of-war tracking: revealed_at IS NULL = in fog; set once, never reset
CREATE TABLE IF NOT EXISTS conquest_province_state (
    model_id             TEXT        PRIMARY KEY,
    revealed_at          TIMESTAMPTZ,
    revealed_by_user_id  INTEGER
);


-- ============================================================
-- STEP 2: Performance index
-- Must exist before conquest queries at scale.
-- CONCURRENTLY = no table lock (safe on production).
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_conquest
    ON logs (model_name, user_id, created_at DESC)
    WHERE type = 2;


-- ============================================================
-- STEP 3: Materialized view — current province owners
--
-- Owner = user with most tokens (prompt + completion) on this
-- model in the last 24 hours. Tie-break: earliest first request.
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS conquest_current_owners AS
SELECT
    model_name,
    user_id,
    username,
    SUM(prompt_tokens + completion_tokens) AS total_tokens,
    ROW_NUMBER() OVER (
        PARTITION BY model_name
        ORDER BY SUM(prompt_tokens + completion_tokens) DESC,
                 MIN(created_at) ASC  -- tie-break: who started first
    ) AS rank
FROM logs
WHERE type = 2
  AND (content = '' OR content IS NULL)
  AND created_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours')
GROUP BY model_name, user_id, username;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conquest_owners_model_rank
    ON conquest_current_owners (model_name, rank);


-- ============================================================
-- STEP 4: pg_cron — refresh every 5 minutes
-- ============================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'refresh-conquest-owners';

SELECT cron.schedule(
    'refresh-conquest-owners',
    '*/5 * * * *',
    $$ REFRESH MATERIALIZED VIEW CONCURRENTLY conquest_current_owners; $$
);


-- ============================================================
-- STEP 5: Seed Dark Lord factions
--
-- These are the fictional rulers of unclaimed territories.
-- When a real user accumulates more tokens than the Dark Lord,
-- the province flips to "claimed" automatically.
-- ============================================================

INSERT INTO conquest_seed_owners (model_id, faction_name) VALUES

    -- ── The OpenAI Empire ────────────────────────────────────
    -- Dark Lord: The Iron Codex (cold mechanical power)
    ('gpt-4o',                    'The Iron Codex'),
    ('gpt-4o-mini',               'The Iron Codex'),
    ('gpt-4.1',                   'The Iron Codex'),
    ('gpt-4.1-mini',              'The Iron Codex'),
    ('gpt-4.1-nano',              'The Iron Codex'),
    ('gpt-4-turbo',               'The Iron Codex'),
    ('gpt-4-turbo-preview',       'The Iron Codex'),
    ('gpt-3.5-turbo',             'The Iron Codex'),
    ('chatgpt-4o-latest',         'The Iron Codex'),
    ('o1',                        'The Iron Codex'),
    ('o1-mini',                   'The Iron Codex'),
    ('o1-preview',                'The Iron Codex'),
    ('o3',                        'The Iron Codex'),
    ('o3-mini',                   'The Iron Codex'),
    ('o4-mini',                   'The Iron Codex'),

    -- ── The Anthropic Realm ──────────────────────────────────
    -- Dark Lord: The Whispering Syndicate (secret advisors)
    ('anthropic/claude-opus-4-6',              'The Whispering Syndicate'),
    ('anthropic/claude-sonnet-4-6',            'The Whispering Syndicate'),
    ('anthropic/claude-haiku-4-5-20251001',    'The Whispering Syndicate'),
    ('anthropic/claude-opus-4-5',              'The Whispering Syndicate'),
    ('anthropic/claude-sonnet-4-5',            'The Whispering Syndicate'),
    ('anthropic/claude-3-5-sonnet-20241022',   'The Whispering Syndicate'),
    ('anthropic/claude-3-5-haiku-20241022',    'The Whispering Syndicate'),
    ('anthropic/claude-3-opus-20240229',       'The Whispering Syndicate'),
    ('anthropic/claude-3-sonnet-20240229',     'The Whispering Syndicate'),
    ('anthropic/claude-3-haiku-20240307',      'The Whispering Syndicate'),

    -- ── The Google Dominion ──────────────────────────────────
    -- Dark Lord: The Mirror Court (reflections, illusions)
    ('google/gemini-2.5-pro-preview-03-25',          'The Mirror Court'),
    ('google/gemini-2.5-pro-exp-03-25',              'The Mirror Court'),
    ('google/gemini-2.5-flash-preview-04-17',        'The Mirror Court'),
    ('google/gemini-2.0-flash',                      'The Mirror Court'),
    ('google/gemini-2.0-flash-thinking-exp-01-21',   'The Mirror Court'),
    ('google/gemini-2.0-flash-lite',                 'The Mirror Court'),
    ('google/gemini-1.5-pro',                        'The Mirror Court'),
    ('google/gemini-1.5-flash',                      'The Mirror Court'),
    ('google/gemini-1.5-flash-8b',                   'The Mirror Court'),

    -- ── The DeepSeek Confederation ───────────────────────────
    -- Dark Lord: The Recursive Void (infinite recursion)
    ('deepseek/deepseek-chat',             'The Recursive Void'),
    ('deepseek/deepseek-reasoner',         'The Recursive Void'),
    ('deepseek/deepseek-r1',               'The Recursive Void'),
    ('deepseek/deepseek-r1-zero',          'The Recursive Void'),
    ('deepseek/deepseek-v3',               'The Recursive Void'),
    ('deepseek/deepseek-v2.5',             'The Recursive Void'),

    -- ── The Qwen Dominion ────────────────────────────────────
    -- Dark Lord: The Jade Assembly (ancient eastern wisdom)
    ('qwen/qwen-turbo',                    'The Jade Assembly'),
    ('qwen/qwen-plus',                     'The Jade Assembly'),
    ('qwen/qwen-max',                      'The Jade Assembly'),
    ('qwen/qwen-max-longcontext',          'The Jade Assembly'),
    ('qwen/qwen2.5-72b-instruct',          'The Jade Assembly'),
    ('qwen/qwen2.5-32b-instruct',          'The Jade Assembly'),
    ('qwen/qwen2.5-14b-instruct',          'The Jade Assembly'),
    ('qwen/qwen2.5-7b-instruct',           'The Jade Assembly'),
    ('qwen/qwq-32b',                       'The Jade Assembly'),
    ('qwen/qwq-32b-preview',               'The Jade Assembly'),

    -- ── The Meta Wildlands ───────────────────────────────────
    -- Dark Lord: The Open Horde (the wild frontier)
    ('meta-llama/llama-3.3-70b-instruct',         'The Open Horde'),
    ('meta-llama/llama-3.1-405b-instruct',        'The Open Horde'),
    ('meta-llama/llama-3.1-70b-instruct',         'The Open Horde'),
    ('meta-llama/llama-3.1-8b-instruct',          'The Open Horde'),
    ('meta-llama/llama-3.2-90b-vision-instruct',  'The Open Horde'),
    ('meta-llama/llama-3.2-11b-vision-instruct',  'The Open Horde'),
    ('meta-llama/llama-3.2-3b-instruct',          'The Open Horde'),
    ('meta-llama/llama-3.2-1b-instruct',          'The Open Horde'),
    ('meta-llama/llama-4-scout',                  'The Open Horde'),
    ('meta-llama/llama-4-maverick',               'The Open Horde'),

    -- ── The Mistral Provinces ────────────────────────────────
    -- Dark Lord: The Codex Compact (the scholars' guild)
    ('mistralai/mistral-large-2411',              'The Codex Compact'),
    ('mistralai/mistral-small-2503',              'The Codex Compact'),
    ('mistralai/mistral-medium-3',                'The Codex Compact'),
    ('mistralai/mistral-7b-instruct',             'The Codex Compact'),
    ('mistralai/mixtral-8x7b-instruct',           'The Codex Compact'),
    ('mistralai/mixtral-8x22b-instruct',          'The Codex Compact'),
    ('mistralai/codestral-2501',                  'The Codex Compact'),
    ('mistralai/pixtral-large-2411',              'The Codex Compact'),

    -- ── The xAI Frontier ─────────────────────────────────────
    -- Dark Lord: The Grok Collective
    ('x-ai/grok-3',                'The Grok Collective'),
    ('x-ai/grok-3-fast',           'The Grok Collective'),
    ('x-ai/grok-3-mini',           'The Grok Collective'),
    ('x-ai/grok-3-mini-fast',      'The Grok Collective'),
    ('x-ai/grok-2-1212',           'The Grok Collective'),
    ('x-ai/grok-2-vision-1212',    'The Grok Collective'),
    ('x-ai/grok-beta',             'The Grok Collective'),

    -- ── The Perplexity Seas ──────────────────────────────────
    -- Dark Lord: The Sonar Fleet
    ('perplexity/sonar-pro',               'The Sonar Fleet'),
    ('perplexity/sonar',                   'The Sonar Fleet'),
    ('perplexity/sonar-reasoning-pro',     'The Sonar Fleet'),
    ('perplexity/sonar-reasoning',         'The Sonar Fleet'),
    ('perplexity/sonar-deep-research',     'The Sonar Fleet'),

    -- ── The Amazon Forests ───────────────────────────────────
    -- Dark Lord: The Nova Council
    ('amazon/nova-pro-v1',    'The Nova Council'),
    ('amazon/nova-lite-v1',   'The Nova Council'),
    ('amazon/nova-micro-v1',  'The Nova Council'),
    ('amazon/nova-premier',   'The Nova Council')

ON CONFLICT (model_id) DO NOTHING;


-- ============================================================
-- STEP 6: Founding Keeps (permanent brand anchors, uncapturable)
-- One per kingdom — the oldest/base model.
-- ============================================================

INSERT INTO conquest_seed_owners (model_id, faction_name, faction_type, capturable) VALUES
    ('gpt-3.5-turbo',                    'Aporto Founding Keep', 'founding_keep', false),
    ('anthropic/claude-3-haiku-20240307','Aporto Founding Keep', 'founding_keep', false),
    ('google/gemini-1.5-flash-8b',       'Aporto Founding Keep', 'founding_keep', false),
    ('meta-llama/llama-3.2-1b-instruct', 'Aporto Founding Keep', 'founding_keep', false),
    ('mistralai/mistral-7b-instruct',    'Aporto Founding Keep', 'founding_keep', false)
ON CONFLICT (model_id) DO UPDATE
    SET faction_name = EXCLUDED.faction_name,
        faction_type = EXCLUDED.faction_type,
        capturable   = EXCLUDED.capturable;


-- ============================================================
-- Verify:
-- SELECT COUNT(*) FROM conquest_seed_owners;
-- SELECT * FROM conquest_current_owners WHERE rank = 1 LIMIT 10;
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'refresh-conquest-owners';
-- ============================================================
