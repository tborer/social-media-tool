-- Migration: add_platform_post_fields
-- Adds per-platform post ID columns and targetPlatforms array to ContentPost.

ALTER TABLE "ContentPost"
  ADD COLUMN IF NOT EXISTS "targetPlatforms" TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "linkedinPostId"  TEXT,
  ADD COLUMN IF NOT EXISTS "xPostId"         TEXT;
