-- CreateTable
CREATE TABLE "SkillSubmission" (
    "id" SERIAL NOT NULL,
    "publisherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "paramsSchema" TEXT,
    "tags" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewNote" TEXT,
    "aiRecommendation" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultSkillId" INTEGER,
    "resultProviderId" INTEGER,

    CONSTRAINT "SkillSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionProvider" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "pricePerCall" DOUBLE PRECISION NOT NULL,
    "providerSecret" TEXT,
    "costPerChar" DOUBLE PRECISION,

    CONSTRAINT "SubmissionProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillSubmission_status_idx" ON "SkillSubmission"("status");

-- CreateIndex
CREATE INDEX "SkillSubmission_publisherId_idx" ON "SkillSubmission"("publisherId");

-- CreateIndex
CREATE INDEX "SubmissionProvider_submissionId_idx" ON "SubmissionProvider"("submissionId");

-- AddForeignKey
ALTER TABLE "SkillSubmission" ADD CONSTRAINT "SkillSubmission_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionProvider" ADD CONSTRAINT "SubmissionProvider_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SkillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
