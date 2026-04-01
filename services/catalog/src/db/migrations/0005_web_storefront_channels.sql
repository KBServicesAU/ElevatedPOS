-- Migration: add web storefront columns + channels as text[] to products
-- Supports multi-channel selling (POS-only, web-only, or both)

-- Convert existing jsonb channels column to text[] and add web storefront fields
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS channels_new   text[]  NOT NULL DEFAULT ARRAY['pos'],
  ADD COLUMN IF NOT EXISTS web_slug       varchar(255),
  ADD COLUMN IF NOT EXISTS web_description text,
  ADD COLUMN IF NOT EXISTS web_images     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS web_featured   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS web_sort_order integer NOT NULL DEFAULT 0;

-- Migrate existing channels jsonb values to the new text[] column if present
UPDATE products
SET channels_new = ARRAY(SELECT jsonb_array_elements_text(channels))
WHERE channels IS NOT NULL AND jsonb_typeof(channels) = 'array' AND jsonb_array_length(channels) > 0;

-- Drop old jsonb column and rename new one
ALTER TABLE products DROP COLUMN IF EXISTS channels;
ALTER TABLE products RENAME COLUMN channels_new TO channels;

-- Unique index on web_slug for fast storefront lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_web_slug ON products (web_slug) WHERE web_slug IS NOT NULL;

-- Index for efficient per-org web storefront queries
CREATE INDEX IF NOT EXISTS idx_products_org_web ON products (org_id, web_featured, web_sort_order)
  WHERE is_active = true;
