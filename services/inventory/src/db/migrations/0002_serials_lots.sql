-- Serial numbers and lot batches migration

CREATE TYPE serial_status AS ENUM ('in_stock', 'sold', 'returned', 'scrapped');
CREATE TYPE lot_status AS ENUM ('active', 'depleted', 'recalled', 'expired');

CREATE TABLE IF NOT EXISTS "serial_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "serial_number" varchar(255) NOT NULL,
  "status" serial_status NOT NULL DEFAULT 'in_stock',
  "purchase_order_id" uuid,
  "order_id" uuid,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "sold_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_serial_numbers_org_serial ON "serial_numbers"("org_id", "serial_number");
CREATE INDEX idx_serial_numbers_org_id ON "serial_numbers"("org_id");
CREATE INDEX idx_serial_numbers_product_id ON "serial_numbers"("product_id");
CREATE INDEX idx_serial_numbers_location_id ON "serial_numbers"("location_id");
CREATE INDEX idx_serial_numbers_status ON "serial_numbers"("status");

CREATE TABLE IF NOT EXISTS "lot_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "lot_number" varchar(255) NOT NULL,
  "supplier_id" uuid,
  "quantity" numeric(12,3) NOT NULL,
  "remaining_qty" numeric(12,3) NOT NULL,
  "expires_at" timestamptz,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "unit_cost" numeric(12,4),
  "notes" text,
  "status" lot_status NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lot_batches_org_id ON "lot_batches"("org_id");
CREATE INDEX idx_lot_batches_product_id ON "lot_batches"("product_id");
CREATE INDEX idx_lot_batches_location_id ON "lot_batches"("location_id");
CREATE INDEX idx_lot_batches_status ON "lot_batches"("status");
CREATE INDEX idx_lot_batches_expires_at ON "lot_batches"("expires_at");
