-- AlterTable
ALTER TABLE "SocialMediaAccount" ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
