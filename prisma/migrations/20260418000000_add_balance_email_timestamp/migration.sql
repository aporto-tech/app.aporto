-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastInsufficientBalanceEmailAt" TIMESTAMP(3);
