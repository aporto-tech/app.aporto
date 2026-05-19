CREATE TABLE IF NOT EXISTS "HelloBarAnnouncement" (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  href TEXT,
  "backgroundColor" TEXT NOT NULL DEFAULT '#00dc82',
  "textColor" TEXT NOT NULL DEFAULT '#000000',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "HelloBarAnnouncement_isActive_sortOrder_idx"
  ON "HelloBarAnnouncement" ("isActive", "sortOrder");
