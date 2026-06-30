---
name: MFH production schema baseline
description: The correct commit and schema for the MFH feature — production uses the manufacturer-based schema, not the Home Series rename
---

# MFH Production Schema Baseline

## The rule
Always restore MFH from commit **e45b289** (pre-Task-1012), not from 6e6380d (Task #1019).

**Why:** Task #1019 (Home Series rename: mfh_manufacturers → mfh_home_series, model_id → home_series_id) was attempted but **never successfully deployed to production**. Production has always had the original manufacturer-based schema. Restoring from 6e6380d creates a dev/production mismatch that would cause Drizzle to generate destructive migrations on next publish.

## Production schema (the truth)
Tables: `mfh_construction_types`, `mfh_manufacturers`, `mfh_models`, `mfh_pricing_guides`, `mfh_guide_items`, `mfh_guide_addons`

Key columns:
- `mfh_models.manufacturer_id` (NOT home_series_id)
- `mfh_pricing_guides.manufacturer_id` (NOT global/unscoped)
- `mfh_guide_items.model_id` (NOT home_series_id)
- `jobs.mfh_manufacturer_id` (NOT mfh_series_id)
- `estimates.mfh_dealer_price, mfh_quoted_price, mfh_guide_name`

## How to apply
Before any MFH restore, run a read-only comparison between dev and production using `executeSql({ environment: 'production' })` to verify the baseline. Never assume git commit messages accurately reflect what was deployed to production — always compare against the live DB.

## If you ever want to do the Home Series rename
Treat it as a fresh, carefully planned migration — not a restore. It requires:
- A data migration plan for existing production rows
- FK column renames with data preservation
- User review of Drizzle's generated diff before publishing
