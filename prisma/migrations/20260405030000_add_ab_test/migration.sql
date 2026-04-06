-- Migration: add_ab_test
-- Adds the ABTest table for tracking A/B post comparisons.

CREATE TABLE IF NOT EXISTS "ABTest" (
  "id"         TEXT         NOT NULL,
  "userId"     UUID         NOT NULL,
  "postAId"    TEXT         NOT NULL,
  "postBId"    TEXT         NOT NULL,
  "notes"      TEXT,
  "status"     TEXT         NOT NULL DEFAULT 'active',
  "winnerId"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comparedAt" TIMESTAMP(3),
  CONSTRAINT "ABTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ABTest_userId_idx"  ON "ABTest" ("userId");
CREATE INDEX IF NOT EXISTS "ABTest_postAId_idx" ON "ABTest" ("postAId");
CREATE INDEX IF NOT EXISTS "ABTest_postBId_idx" ON "ABTest" ("postBId");
