CREATE TABLE IF NOT EXISTS "TelegramConversation" (
  id text PRIMARY KEY,
  "telegramUserId" text NOT NULL UNIQUE,
  "chatId" text NOT NULL,
  "pendingAction" text,
  "pendingPayload" jsonb,
  "lastIntent" text,
  "lastParams" jsonb,
  "lastSkillId" integer,
  "lastProviderHint" text,
  "lastRunId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TelegramConversation_chatId_idx"
  ON "TelegramConversation" ("chatId");

CREATE TABLE IF NOT EXISTS "TelegramSkillDelivery" (
  id text PRIMARY KEY,
  "runId" text NOT NULL UNIQUE,
  "telegramUserId" text NOT NULL,
  "chatId" text NOT NULL,
  "replyToMessageId" integer,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  "lastError" text,
  "sentAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TelegramSkillDelivery_status_createdAt_idx"
  ON "TelegramSkillDelivery" (status, "createdAt");

CREATE INDEX IF NOT EXISTS "TelegramSkillDelivery_telegramUserId_createdAt_idx"
  ON "TelegramSkillDelivery" ("telegramUserId", "createdAt");
