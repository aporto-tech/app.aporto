CREATE TABLE IF NOT EXISTS "TelegramAccount" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "newApiUserId" INTEGER NOT NULL,
  "telegramUserId" TEXT NOT NULL UNIQUE,
  "chatId" TEXT NOT NULL,
  username TEXT,
  "firstName" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TelegramAccount_userId_idx"
  ON "TelegramAccount" ("userId");

CREATE INDEX IF NOT EXISTS "TelegramAccount_newApiUserId_idx"
  ON "TelegramAccount" ("newApiUserId");

CREATE INDEX IF NOT EXISTS "TelegramAccount_chatId_idx"
  ON "TelegramAccount" ("chatId");

CREATE TABLE IF NOT EXISTS "TelegramLinkToken" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLinkToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TelegramLinkToken_userId_expiresAt_idx"
  ON "TelegramLinkToken" ("userId", "expiresAt");
