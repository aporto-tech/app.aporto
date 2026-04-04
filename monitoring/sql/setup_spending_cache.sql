-- ============================================================
-- Daily Spending Cache — Initial Setup
--
-- Run this script ONCE in Supabase SQL Editor.
-- It is safe to re-run (idempotent).
--
-- What this does:
--   1. Creates daily_spending_cache (aggregate per day)
--   2. Creates daily_spending_by_user_cache (per user per day)
--   3. Populates ALL historical data from logs
--   4. Sets up pg_cron to refresh only the last 2 days daily
--
-- Requirements for pg_cron:
--   Supabase: Database → Extensions → enable "pg_cron"
-- ============================================================


-- ============================================================
-- STEP 1: Create tables
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_spending_cache (
    day            DATE           PRIMARY KEY,
    total_usd      NUMERIC(12, 6) NOT NULL DEFAULT 0,
    request_count  INTEGER        NOT NULL DEFAULT 0,
    cached_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsc_day ON daily_spending_cache (day);

-- Per-user breakdown table
CREATE TABLE IF NOT EXISTS daily_spending_by_user_cache (
    day           DATE           NOT NULL,
    user_id       INTEGER        NOT NULL,
    username      TEXT           NOT NULL DEFAULT '',
    total_usd     NUMERIC(12, 6) NOT NULL DEFAULT 0,
    request_count INTEGER        NOT NULL DEFAULT 0,
    cached_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (day, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dsbuc_day ON daily_spending_by_user_cache (day);


-- ============================================================
-- STEP 2: Populate full history from logs
--
-- quota / 500000 = USD  (QUOTA_PER_DOLLAR = 500_000)
-- type = 2 means successful request
-- ============================================================

-- Aggregate totals
INSERT INTO daily_spending_cache (day, total_usd, request_count, cached_at)
SELECT
    DATE(to_timestamp(created_at))        AS day,
    ROUND(SUM(quota) / 500000.0, 6)       AS total_usd,
    COUNT(*)                               AS request_count,
    NOW()                                  AS cached_at
FROM logs
WHERE type = 2
  AND quota > 0
GROUP BY DATE(to_timestamp(created_at))
ON CONFLICT (day) DO UPDATE
    SET total_usd     = EXCLUDED.total_usd,
        request_count = EXCLUDED.request_count,
        cached_at     = NOW();

-- Per-user totals
INSERT INTO daily_spending_by_user_cache (day, user_id, username, total_usd, request_count, cached_at)
SELECT
    DATE(to_timestamp(created_at))                              AS day,
    user_id,
    COALESCE(NULLIF(username, ''), 'user_' || user_id::text)   AS username,
    ROUND(SUM(quota) / 500000.0, 6)                            AS total_usd,
    COUNT(*)                                                    AS request_count,
    NOW()                                                       AS cached_at
FROM logs
WHERE type = 2
  AND quota > 0
GROUP BY
    DATE(to_timestamp(created_at)),
    user_id,
    COALESCE(NULLIF(username, ''), 'user_' || user_id::text)
ON CONFLICT (day, user_id) DO UPDATE
    SET total_usd     = EXCLUDED.total_usd,
        request_count = EXCLUDED.request_count,
        username      = EXCLUDED.username,
        cached_at     = NOW();


-- ============================================================
-- STEP 3: pg_cron — daily refresh at 02:00 UTC
--
-- Unschedule first so this block is safe to re-run.
-- Only re-aggregates the last 2 days — past months stay static.
-- ============================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'update-daily-spending-cache';

SELECT cron.schedule(
    'update-daily-spending-cache',
    '0 2 * * *',
    $$
        -- Aggregate totals
        INSERT INTO daily_spending_cache (day, total_usd, request_count, cached_at)
        SELECT
            DATE(to_timestamp(created_at)) AS day,
            ROUND(SUM(quota) / 500000.0, 6) AS total_usd,
            COUNT(*) AS request_count,
            NOW() AS cached_at
        FROM logs
        WHERE type = 2
          AND quota > 0
          AND DATE(to_timestamp(created_at)) >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(to_timestamp(created_at))
        ON CONFLICT (day) DO UPDATE
            SET total_usd     = EXCLUDED.total_usd,
                request_count = EXCLUDED.request_count,
                cached_at     = NOW();

        -- Per-user totals
        INSERT INTO daily_spending_by_user_cache (day, user_id, username, total_usd, request_count, cached_at)
        SELECT
            DATE(to_timestamp(created_at)) AS day,
            user_id,
            COALESCE(NULLIF(username, ''), 'user_' || user_id::text) AS username,
            ROUND(SUM(quota) / 500000.0, 6) AS total_usd,
            COUNT(*) AS request_count,
            NOW() AS cached_at
        FROM logs
        WHERE type = 2
          AND quota > 0
          AND DATE(to_timestamp(created_at)) >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY
            DATE(to_timestamp(created_at)),
            user_id,
            COALESCE(NULLIF(username, ''), 'user_' || user_id::text)
        ON CONFLICT (day, user_id) DO UPDATE
            SET total_usd     = EXCLUDED.total_usd,
                request_count = EXCLUDED.request_count,
                username      = EXCLUDED.username,
                cached_at     = NOW();
    $$
);

-- Verify:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'update-daily-spending-cache';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
