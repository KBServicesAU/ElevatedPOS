CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE product_type AS ENUM ('standard', 'variant', 'kit', 'service');

CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "parent_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "description" text,
  "image_url" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_org_id ON "categories"("org_id");

CREATE TABLE IF NOT EXISTS "tax_classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "rate" numeric(8,4) NOT NULL,
  "is_inclusive" boolean NOT NULL DEFAULT true,
  "is_default" boolean NOT NULL DEFAULT false,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tax_classes_org_id ON "tax_classes"("org_id");

CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "brand_id" uuid,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "tax_class_id" uuid REFERENCES "tax_classes"("id") ON DELETE SET NULL,
  "product_type" product_type NOT NULL DEFAULT 'standard',
  "name" varchar(255) NOT NULL,
  "description" text,
  "sku" varchar(100) NOT NULL,
  "barcodes" jsonb NOT NULL DEFAULT '[]',
  "unit_of_measure" varchar(50) DEFAULT 'each',
  "base_price" numeric(12,4) NOT NULL DEFAULT 0,
  "cost_price" numeric(12,4) NOT NULL DEFAULT 0,
  "images" jsonb NOT NULL DEFAULT '[]',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "is_active" boolean NOT NULL DEFAULT true,
  "is_sold_online" boolean NOT NULL DEFAULT false,
  "is_sold_instore" boolean NOT NULL DEFAULT true,
  "track_stock" boolean NOT NULL DEFAULT true,
  "reorder_point" integer NOT NULL DEFAULT 0,
  "reorder_quantity" integer NOT NULL DEFAULT 0,
  "weight_based" boolean NOT NULL DEFAULT false,
  "weight_unit" varchar(20),
  "age_restricted" boolean NOT NULL DEFAULT false,
  "age_restriction_minimum" integer,
  "hospitality_course" varchar(50),
  "plu_code" varchar(20),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_org_id ON "products"("org_id");
CREATE INDEX idx_products_category_id ON "products"("category_id");
CREATE UNIQUE INDEX idx_products_org_sku ON "products"("org_id", "sku");

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "sku" varchar(100) NOT NULL,
  "barcode" varchar(100),
  "attributes" jsonb NOT NULL DEFAULT '{}',
  "price_override" numeric(12,4),
  "cost_price_override" numeric(12,4),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "modifier_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "selection_type" varchar(20) NOT NULL DEFAULT 'single',
  "required" boolean NOT NULL DEFAULT false,
  "min_selections" integer NOT NULL DEFAULT 0,
  "max_selections" integer NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "modifier_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "price_adjustment" numeric(12,4) NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_available" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "product_modifier_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "price_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'AUD',
  "is_default" boolean NOT NULL DEFAULT false,
  "channels" jsonb NOT NULL DEFAULT '[]',
  "location_ids" jsonb NOT NULL DEFAULT '[]',
  "start_at" timestamptz,
  "end_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "price_list_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "price_list_id" uuid NOT NULL REFERENCES "price_lists"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" uuid,
  "price" numeric(12,4) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
