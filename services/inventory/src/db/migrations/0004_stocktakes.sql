-- Stocktake / Inventory Count migration

CREATE TYPE stocktake_status AS ENUM ('draft', 'in_review', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS "stocktakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "name" varchar(255),
  "status" stocktake_status NOT NULL DEFAULT 'draft',
  "number" varchar(100) NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz,
  "completed_at" timestamptz,
  "approved_by" uuid,
  "notes" text,
  "total_variance_value" numeric(12,4) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stocktakes_org_id ON "stocktakes"("org_id");
CREATE INDEX idx_stocktakes_location_id ON "stocktakes"("location_id");
CREATE INDEX idx_stocktakes_status ON "stocktakes"("status");
CREATE INDEX idx_stocktakes_number ON "stocktakes"("number");

CREATE TABLE IF NOT EXISTS "stocktake_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stocktake_id" uuid NOT NULL REFERENCES "stocktakes"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL,
  "sku" varchar(100) NOT NULL DEFAULT '',
  "product_name" varchar(255) NOT NULL DEFAULT '',
  "system_qty" numeric(12,3) NOT NULL DEFAULT 0,
  "counted_qty" numeric(12,3),
  "variance" numeric(12,3),
  "unit_cost" numeric(12,4) NOT NULL DEFAULT 0
);
CREATE INDEX idx_stocktake_lines_stocktake_id ON "stocktake_lines"("stocktake_id");
CREATE INDEX idx_stocktake_lines_product_id ON "stocktake_lines"("product_id");
