-- Bundles and Markdowns migration

CREATE TYPE bundle_type AS ENUM ('fixed', 'dynamic');
CREATE TYPE bundle_discount_type AS ENUM ('none', 'percentage', 'fixed');
CREATE TYPE markdown_scope AS ENUM ('product', 'category', 'all');
CREATE TYPE markdown_discount_type AS ENUM ('percentage', 'fixed');

CREATE TABLE IF NOT EXISTS "product_bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "bundle_type" bundle_type NOT NULL DEFAULT 'fixed',
  "name" text NOT NULL,
  "description" text,
  "fixed_price" numeric(12,4),
  "discount_type" bundle_discount_type NOT NULL DEFAULT 'none',
  "discount_value" numeric(12,4) NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_bundles_org_id ON "product_bundles"("org_id");
CREATE INDEX idx_product_bundles_product_id ON "product_bundles"("product_id");

CREATE TABLE IF NOT EXISTS "bundle_components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bundle_id" uuid NOT NULL REFERENCES "product_bundles"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "variant_id" uuid,
  "quantity" numeric(12,3) NOT NULL DEFAULT 1,
  "is_required" boolean NOT NULL DEFAULT true,
  "allow_substitutes" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_bundle_components_bundle_id ON "bundle_components"("bundle_id");
CREATE INDEX idx_bundle_components_product_id ON "bundle_components"("product_id");

CREATE TABLE IF NOT EXISTS "markdowns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" text NOT NULL,
  "scope" markdown_scope NOT NULL,
  "target_id" uuid,
  "discount_type" markdown_discount_type NOT NULL,
  "discount_value" numeric(12,4) NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_clearance" boolean NOT NULL DEFAULT false,
  "applied_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_markdowns_org_id ON "markdowns"("org_id");
CREATE INDEX idx_markdowns_scope ON "markdowns"("scope");
CREATE INDEX idx_markdowns_is_active ON "markdowns"("is_active");
CREATE INDEX idx_markdowns_starts_at ON "markdowns"("starts_at");
CREATE INDEX idx_markdowns_ends_at ON "markdowns"("ends_at");
