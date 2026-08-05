-- Vehicle Profiles: store truck identity + MPG + fuel price per vehicle
-- Replaces single vehicleMpg / fuelPricePerGallon fields in settings (retained as fallback)
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" serial PRIMARY KEY,
  "business_id" integer,
  "nickname" text NOT NULL DEFAULT 'My Truck',
  "year" integer,
  "make" text,
  "model" text,
  "avg_mpg" integer NOT NULL DEFAULT 17,
  "fuel_price_per_gallon" numeric(6,3),
  "fuel_price_updated_at" timestamp,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
