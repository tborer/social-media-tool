-- Migration: add_x_bluesky_enum_values
-- Adds X and BLUESKY to the AccountType enum.
-- These values exist in schema.prisma but were never added via migration,
-- causing fresh database deployments to fail.

ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'X';
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'BLUESKY';
