-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'USED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "sourceUrl" TEXT,
    "sourceAccountName" TEXT,
    "sourceCaption" TEXT,
    "sourceImageUrl" TEXT,
    "sourceLikes" INTEGER,
    "sourceComments" INTEGER,
    "notes" TEXT,
    "tags" TEXT[],
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedHashtag" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "hashtag" TEXT NOT NULL,
    "postCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedHashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedCompetitor" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "igUserId" TEXT,
    "username" TEXT NOT NULL,
    "followerCount" INTEGER,
    "mediaCount" INTEGER,
    "bio" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentIdea_userId_idx" ON "ContentIdea"("userId");

-- CreateIndex
CREATE INDEX "TrackedHashtag_userId_idx" ON "TrackedHashtag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedHashtag_userId_hashtag_key" ON "TrackedHashtag"("userId", "hashtag");

-- CreateIndex
CREATE INDEX "TrackedCompetitor_userId_idx" ON "TrackedCompetitor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedCompetitor_userId_username_key" ON "TrackedCompetitor"("userId", "username");

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedHashtag" ADD CONSTRAINT "TrackedHashtag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedCompetitor" ADD CONSTRAINT "TrackedCompetitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
