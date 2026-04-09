-- AlterEnum: Add FACEBOOK to AccountType
ALTER TYPE "AccountType" ADD VALUE 'FACEBOOK';

-- AlterTable: Add Phase 5 fields to ContentPost
ALTER TABLE "ContentPost" ADD COLUMN "originalPostId" TEXT;
ALTER TABLE "ContentPost" ADD COLUMN "platformOverrides" JSONB;
ALTER TABLE "ContentPost" ADD COLUMN "facebookPostId" TEXT;
ALTER TABLE "ContentPost" ADD COLUMN "blueskyPostUri" TEXT;

-- AlterTable: Add Facebook & Bluesky fields to SocialMediaAccount
ALTER TABLE "SocialMediaAccount" ADD COLUMN "facebookPageId" TEXT;
ALTER TABLE "SocialMediaAccount" ADD COLUMN "facebookPageName" TEXT;
ALTER TABLE "SocialMediaAccount" ADD COLUMN "blueskyHandle" TEXT;
ALTER TABLE "SocialMediaAccount" ADD COLUMN "blueskyDid" TEXT;
