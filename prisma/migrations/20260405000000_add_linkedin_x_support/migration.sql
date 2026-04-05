-- Migration: add_linkedin_x_support
-- Adds LINKEDIN to AccountType enum and new columns to SocialMediaAccount
-- for LinkedIn and X (Twitter) platform support.

-- Step 1: Add LINKEDIN to the AccountType enum
-- ALTER TYPE ... ADD VALUE is not transactional in PostgreSQL but is safe here
-- because the enum value is purely additive.
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'LINKEDIN';

-- Step 2: Add new columns to SocialMediaAccount
ALTER TABLE "SocialMediaAccount"
  ADD COLUMN IF NOT EXISTS "refreshToken"           TEXT,
  ADD COLUMN IF NOT EXISTS "linkedinUserId"         TEXT,
  ADD COLUMN IF NOT EXISTS "linkedinOrganizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "xUserId"                TEXT;
