-- Add AI collection routing preferences and tracking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiCollectionsEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Link" ADD COLUMN IF NOT EXISTS "aiCollectionAssigned" BOOLEAN NOT NULL DEFAULT FALSE;
