-- Migration: 0004_ingredients_product_recipes.sql
-- Adds ingredient stock tracking and product recipe (ingredient mapping) tables

DO $$ BEGIN
  CREATE TYPE ingredient_unit AS ENUM ('kg', 'g', 'L', 'mL', 'each');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ingredients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  name            TEXT NOT NULL,
  unit            ingredient_unit NOT NULL,
  cost_per_unit   DECIMAL(12, 4) NOT NULL DEFAULT 0,
  current_stock   DECIMAL(12, 3) NOT NULL DEFAULT 0,
  reorder_point   DECIMAL(12, 3) NOT NULL DEFAULT 0,
  supplier_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_org_id ON ingredients (org_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_name    ON ingredients (org_id, name);

CREATE TABLE IF NOT EXISTS product_recipes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity        DECIMAL(12, 4) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_product_recipes_product_id    ON product_recipes (product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient_id ON product_recipes (ingredient_id);
