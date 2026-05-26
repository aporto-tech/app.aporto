-- CreateTable SkillThread
CREATE TABLE IF NOT EXISTS "SkillThread" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "skillId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SkillThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable SkillThreadMessage
CREATE TABLE IF NOT EXISTS "SkillThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SkillThread_telegramUserId_skillId_key" ON "SkillThread"("telegramUserId", "skillId");
CREATE INDEX IF NOT EXISTS "SkillThread_expiresAt_idx" ON "SkillThread"("expiresAt");
CREATE INDEX IF NOT EXISTS "SkillThreadMessage_threadId_createdAt_idx" ON "SkillThreadMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "SkillThreadMessage" ADD CONSTRAINT "SkillThreadMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "SkillThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restore DB-level default for SkillRun.id (raw INSERT bypasses Prisma cuid generation)
ALTER TABLE "SkillRun" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
