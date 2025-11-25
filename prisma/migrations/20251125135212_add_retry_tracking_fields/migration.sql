-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastRetryAt" TIMESTAMP(3),
ADD COLUMN "errorMessage" TEXT;
