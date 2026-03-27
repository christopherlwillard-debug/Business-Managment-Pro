-- Migration 0005: Fix mileage_auto_track column type
-- Alters mileage_auto_track from its existing type to integer using explicit USING cast.
-- Safe to run even if the column is already integer.

ALTER TABLE settings
  ALTER COLUMN mileage_auto_track TYPE integer USING mileage_auto_track::integer;
