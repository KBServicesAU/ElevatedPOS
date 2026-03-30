-- Recipes, Ingredients and Wastage Events migration

CREATE TYPE wastage_reason AS ENUM ('over_production', 'spoilage', 'damage', 'expiry', 'other');

CREATE TABLE IF NOT EXISTS "recipes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "yield_quantity" numeric(12,3) NOT NULL DEFAULT 1,
  "yield_unit" text NOT NULL DEFAULT 'portion',
  "prep_time_minutes" integer,
  "cook_time_minutes" integer,
  "instructions" text,
  "cost_per_yield" numeric(12,4),
  "cost_calculated_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recipes_org_id ON "recipes"("org_id");
CREATE INDEX idx_recipes_product_id ON "recipes"("product_id");
CREATE INDEX idx_recipes_is_active ON "recipes"("is_active");

CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipe_id" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
  "stock_item_ref" text NOT NULL,
  "ingredient_name" text NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit" text NOT NULL,
  "wastage_percent" numeric(8,4) NOT NULL DEFAULT 0,
  "estimated_cost_per_unit" numeric(12,4),
  "notes" text,
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_recipe_ingredients_recipe_id ON "recipe_ingredients"("recipe_id");

CREATE TABLE IF NOT EXISTS "wastage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "product_id" uuid REFERENCES "products"("id"),
  "recipe_id" uuid REFERENCES "recipes"("id"),
  "quantity" numeric(12,3) NOT NULL,
  "unit" text NOT NULL,
  "reason" wastage_reason NOT NULL,
  "estimated_cost" numeric(12,4),
  "recorded_by" uuid NOT NULL,
  "notes" text,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wastage_events_org_id ON "wastage_events"("org_id");
CREATE INDEX idx_wastage_events_location_id ON "wastage_events"("location_id");
CREATE INDEX idx_wastage_events_product_id ON "wastage_events"("product_id");
CREATE INDEX idx_wastage_events_reason ON "wastage_events"("reason");
CREATE INDEX idx_wastage_events_recorded_at ON "wastage_events"("recorded_at");
