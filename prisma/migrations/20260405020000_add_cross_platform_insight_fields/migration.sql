-- Migration: add_cross_platform_insight_fields
-- Adds platform discriminator and extended metric columns to PostInsight and AccountInsight.

ALTER TABLE "PostInsight"
  ADD COLUMN IF NOT EXISTS "platform"       TEXT    NOT NULL DEFAULT 'INSTAGRAM',
  ADD COLUMN IF NOT EXISTS "platformPostId" TEXT,
  ADD COLUMN IF NOT EXISTS "clicks"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "profileVisits"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bookmarks"      INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PostInsight_platform_idx" ON "PostInsight" ("platform");

ALTER TABLE "AccountInsight"
  ADD COLUMN IF NOT EXISTS "platform"       TEXT    NOT NULL DEFAULT 'INSTAGRAM',
  ADD COLUMN IF NOT EXISTS "followerGrowth" INTEGER;

CREATE INDEX IF NOT EXISTS "AccountInsight_platform_idx" ON "AccountInsight" ("platform");
