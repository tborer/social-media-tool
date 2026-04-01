-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN "igMediaId" TEXT;

-- CreateTable
CREATE TABLE "PostInsight" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "engagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountInsight" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "mediaCount" INTEGER NOT NULL DEFAULT 0,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "websiteClicks" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostInsight_postId_idx" ON "PostInsight"("postId");

-- CreateIndex
CREATE INDEX "AccountInsight_accountId_idx" ON "AccountInsight"("accountId");

-- AddForeignKey
ALTER TABLE "PostInsight" ADD CONSTRAINT "PostInsight_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountInsight" ADD CONSTRAINT "AccountInsight_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialMediaAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
