-- Task #319: Remove unused pricing guide (public-services) table
-- The /api/public-services routes and the Pricing Guide page have been removed.
-- This migration drops the services table which is no longer referenced by any code.

DROP TABLE IF EXISTS "services";
