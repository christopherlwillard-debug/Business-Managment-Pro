-- Task #91: Services & Pricing Guide

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "category" text,
  ADD COLUMN IF NOT EXISTS "pricing_type" text,
  ADD COLUMN IF NOT EXISTS "base_price" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "price_min" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "price_max" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "unit" text,
  ADD COLUMN IF NOT EXISTS "notes" text;

-- Migrate add_ons and whats_included from text (newline-delimited) to jsonb arrays
-- Step 1: add jsonb shadow columns
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "add_ons_json" jsonb,
  ADD COLUMN IF NOT EXISTS "whats_included_json" jsonb;

-- Step 2: backfill jsonb from text
UPDATE "services"
SET
  "add_ons_json" = CASE
    WHEN "add_ons" IS NOT NULL AND trim("add_ons") <> ''
    THEN to_jsonb(string_to_array(trim("add_ons"), E'\n'))
    ELSE '[]'::jsonb
  END,
  "whats_included_json" = CASE
    WHEN "whats_included" IS NOT NULL AND trim("whats_included") <> ''
    THEN to_jsonb(string_to_array(trim("whats_included"), E'\n'))
    ELSE '[]'::jsonb
  END
WHERE "add_ons_json" IS NULL OR "whats_included_json" IS NULL;

-- Step 3: drop old text columns
ALTER TABLE "services"
  DROP COLUMN IF EXISTS "add_ons",
  DROP COLUMN IF EXISTS "whats_included";

-- Step 4: rename jsonb columns to canonical names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='services' AND column_name='add_ons_json'
  ) THEN
    ALTER TABLE "services" RENAME COLUMN "add_ons_json" TO "add_ons";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='services' AND column_name='whats_included_json'
  ) THEN
    ALTER TABLE "services" RENAME COLUMN "whats_included_json" TO "whats_included";
  END IF;
END $$;

-- Seed / upsert all core services with structured jsonb arrays
INSERT INTO "services" (
  "name", "slug", "description", "category", "icon",
  "pricing_type", "base_price", "price_min", "price_max", "unit",
  "price_display", "price_note", "whats_included", "add_ons", "notes",
  "sort_order", "active"
) VALUES
(
  'Trim Work',
  'trim-work',
  'Interior and exterior trim installation including baseboards, crown molding, casing, and custom millwork. Pricing varies by profile size and finish option.',
  'Carpentry',
  '🪵',
  'per_lf',
  NULL,
  6.00,
  35.00,
  'LF',
  '$6–$35/LF depending on profile',
  'Baseboard $6–$25/LF · Crown $10–$35+/LF · Finishing add-ons extra',
  '["Labor & installation","Material sourcing assistance","Clean-up"]'::jsonb,
  '["Caulk & fill (+$2–$4/LF)","Full paint (+$4–$7/LF)","Outside corners","Non-90° angles","Vaulted ceilings","Repairs","Demo"]'::jsonb,
  'Baseboard: Basic 3–5" $6–$10/LF, Standard 5–7" $10–$15/LF, Large 7"+ $15–$25/LF
Crown: Basic $10–$15/LF, Standard $15–$22/LF, Large $22–$35+/LF',
  1,
  true
),
(
  'Siding',
  'siding',
  'Vinyl, fiber cement, and wood siding installation and replacement. Labor-only pricing; materials sourced and marked up separately.',
  'Exterior',
  '🏠',
  'per_sqft',
  NULL,
  1.00,
  3.00,
  'SF',
  '$1–$3/SF labor only',
  'Materials priced separately with 40% markup. Tear-off extra.',
  '["Installation labor","Flashing & wrap integration","Clean-up"]'::jsonb,
  '["Window surcharges: $50–$150 ea","Door surcharges: $75–$200 ea","Tear-off & disposal: $1–$2+/SF","Materials (40% markup applied)"]'::jsonb,
  'Standard Double Wide reference: 36W × 90L × 13.6H ft
End walls: 489.6 SF each | Long walls: 1,224 SF each | Total: ~3,427 SF',
  2,
  true
),
(
  'Flooring',
  'flooring',
  'Carpet, laminate, LVP, hardwood, and tile installation for residential and commercial. Full-install or labor-only pricing available.',
  'Flooring',
  '🔲',
  'per_sqft',
  NULL,
  3.00,
  25.00,
  'SF',
  '$3–$25/SF installed (type & mode vary)',
  'Labor-only available at $1.50–$8/SF. Add-ons priced separately.',
  '["Sub-floor prep (basic)","Installation","Transitions & trim (basic)"]'::jsonb,
  '["Subfloor repair (flat quoted)","Old floor removal: $0.50–$2/SF","Underlayment: $0.25–$0.75/SF","Transitions: $25–$75 each","Stairs: $40–$100 each"]'::jsonb,
  'Carpet: $3–$7/SF | Laminate: $4–$9/SF | LVP/Sheet Vinyl: $4–$10/SF (labor $1.50–$5)
Hardwood: $6–$25/SF (mid $8–$15) | Tile: $7–$20+/SF',
  3,
  true
),
(
  'Plumbing',
  'plumbing',
  'Flat-rate drop model for rough-in plumbing. Base covers trip, setup, city sewer tie-in, and first 2 drops.',
  'Plumbing',
  '🔧',
  'flat',
  1000.00,
  1000.00,
  NULL,
  'Job',
  '$1,000 base + $125/drop after 2nd',
  'Formula: $1,000 + max(0, drops−2) × $125',
  '["Trip & job-site setup","Main city sewer tie-in","First 2 drops","Basic fittings & pipe allowance","Pressure testing","Clean-up"]'::jsonb,
  '["Additional drops (3rd+): +$125 each","Crossover check: +$50","Hook-up (if needed): +$50","Custom add-ons quoted separately"]'::jsonb,
  '2 drops → $1,000 | 4 drops → $1,250 | 9 drops → $1,875 | 10 drops → $2,000',
  4,
  true
),
(
  'AC Platform',
  'ac-platform',
  'Custom AC unit platforms and equipment pads built to code for residential HVAC installations.',
  'HVAC',
  '❄️',
  'flat',
  550.00,
  550.00,
  NULL,
  'Platform',
  '$550 flat',
  'Standard residential platform. Custom sizes quoted separately.',
  '["Framing & decking","Code-compliant build","Unit placement"]'::jsonb,
  '["Custom sizing (quoted)","Rooftop access (quoted)"]'::jsonb,
  'Standard residential AC unit platform. Additional add-ons TBD pending Willard input.',
  5,
  true
)
ON CONFLICT ("slug") DO UPDATE SET
  "description"    = EXCLUDED."description",
  "category"       = EXCLUDED."category",
  "icon"           = EXCLUDED."icon",
  "pricing_type"   = EXCLUDED."pricing_type",
  "base_price"     = EXCLUDED."base_price",
  "price_min"      = EXCLUDED."price_min",
  "price_max"      = EXCLUDED."price_max",
  "unit"           = EXCLUDED."unit",
  "price_display"  = EXCLUDED."price_display",
  "price_note"     = EXCLUDED."price_note",
  "whats_included" = EXCLUDED."whats_included",
  "add_ons"        = EXCLUDED."add_ons",
  "notes"          = EXCLUDED."notes",
  "sort_order"     = EXCLUDED."sort_order";
