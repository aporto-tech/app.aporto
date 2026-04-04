-- ============================================================
-- Daily Spending Cache — Initial Setup
--
-- Run this script ONCE against the New-API PostgreSQL database
-- (the same DB that Grafana's PostgreSQL datasource points to).
--
-- What this does:
--   1. Creates the daily_spending_cache table
--   2. Populates ALL historical data from logs
--   3. Sets up a pg_cron job to refresh only the last 2 days daily
--
-- Requirements for pg_cron:
--   Supabase: Database → Extensions → enable "pg_cron"
--   Then run step 3 below.
-- ============================================================


-- ============================================================
-- STEP 1: Create the cache table
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_spending_cache (
    day            DATE           PRIMARY KEY,
    total_usd      NUMERIC(12, 6) NOT NULL DEFAULT 0,
    request_count  INTEGER        NOT NULL DEFAULT 0,
    cached_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Index for month-range queries (bar chart, monthly table)
CREATE INDEX IF NOT EXISTS idx_dsc_month
    ON daily_spending_cache (DATE_TRUNC('month', day));


-- ============================================================
-- STEP 2: Populate full history from logs
--
-- quota / 500000 = USD  (QUOTA_PER_DOLLAR = 500_000)
-- type = 2 means successful request
-- ============================================================

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


-- ============================================================
-- STEP 3: pg_cron — daily refresh at 02:00 UTC
--
-- Only re-aggregates the last 2 days so past months stay static.
-- Re-run this block if you need to recreate the job:
--   SELECT cron.unschedule('update-daily-spending-cache');
-- ============================================================

SELECT cron.schedule(
    'update-daily-spending-cache',   -- unique job name
    '0 2 * * *',                     -- daily at 02:00 UTC
    $$
        INSERT INTO daily_spending_cache (day, total_usd, request_count, cached_at)
        SELECT
            DATE(to_timestamp(created_at))    AS day,
            ROUND(SUM(quota) / 500000.0, 6)   AS total_usd,
            COUNT(*)                           AS request_count,
            NOW()                              AS cached_at
        FROM logs
        WHERE type = 2
          AND quota > 0
          AND DATE(to_timestamp(created_at)) >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(to_timestamp(created_at))
        ON CONFLICT (day) DO UPDATE
            SET total_usd     = EXCLUDED.total_usd,
                request_count = EXCLUDED.request_count,
                cached_at     = NOW();
    $$
);

-- Verify the job was created:
-- SELECT * FROM cron.job WHERE jobname = 'update-daily-spending-cache';

-- To check last run status:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'update-daily-spending-cache') ORDER BY start_time DESC LIMIT 10;
