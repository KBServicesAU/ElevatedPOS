-- Migration: inventory enhancements
-- Adds printer/KDS routing and color to categories
-- Adds kiosk, nutrition, countdown, and kitchen display fields to products
-- Adds new product_variant_groups, product_variant_options, product_variant_rules tables

-- ── Categories enhancements ────────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS printer_destination varchar(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS kds_destination varchar(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS custom_printer_name varchar(100);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS custom_kds_name varchar(100);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color varchar(20);

-- ── Products enhancements ──────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_on_kiosk boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions jsonb NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS prep_time_minutes integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS calories integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_countdown boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS countdown_qty integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS kitchen_display_name varchar(255);

-- ── Product variant groups (per-product modifier-style variant tree) ────────────
CREATE TABLE IF NOT EXISTS product_variant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  display_name varchar(255),
  required boolean NOT NULL DEFAULT false,
  min_selections integer NOT NULL DEFAULT 0,
  max_selections integer NOT NULL DEFAULT 1,
  allow_multiple boolean NOT NULL DEFAULT false,
  is_root boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Product variant options (choices within a group) ──────────────────────────
CREATE TABLE IF NOT EXISTS product_variant_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES product_variant_groups(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  price_adjustment decimal(12,4) NOT NULL DEFAULT 0,
  sku varchar(100),
  barcode varchar(100),
  image_url text,
  color varchar(20),
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Product variant rules (conditional group visibility) ──────────────────────
CREATE TABLE IF NOT EXISTS product_variant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_option_id uuid NOT NULL REFERENCES product_variant_options(id) ON DELETE CASCADE,
  child_group_id uuid NOT NULL REFERENCES product_variant_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(parent_option_id, child_group_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pvg_product_id ON product_variant_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_pvo_group_id ON product_variant_options(group_id);
CREATE INDEX IF NOT EXISTS idx_pvr_parent ON product_variant_rules(parent_option_id);
