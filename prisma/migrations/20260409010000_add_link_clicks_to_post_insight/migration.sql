-- Migration: add_link_clicks_to_post_insight
-- Adds linkClicks column to PostInsight for link-specific click tracking.
-- The existing clicks column serves as a general/combined click metric,
-- while linkClicks tracks link-specific clicks (LinkedIn link clicks / X url_link_clicks).

ALTER TABLE "PostInsight"
  ADD COLUMN IF NOT EXISTS "linkClicks" INTEGER;
