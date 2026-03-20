CREATE TYPE po_status AS ENUM ('draft', 'sent', 'partial', 'complete', 'cancelled');
CREATE TYPE transfer_status AS ENUM ('requested', 'approved', 'dispatched', 'received', 'cancelled');

CREATE TABLE IF NOT EXISTS "stock_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "location_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "on_hand" numeric(12,3) NOT NULL DEFAULT 0,
  "reserved" numeric(12,3) NOT NULL DEFAULT 0,
  "on_order" numeric(12,3) NOT NULL DEFAULT 0,
  "in_transit" numeric(12,3) NOT NULL DEFAULT 0,
  "bin_location" varchar(100),
  "last_count_at" timestamptz,
  "last_count_qty" numeric(12,3),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_stock_items_loc_product ON "stock_items"("location_id", "product_id", "variant_id");
CREATE INDEX idx_stock_items_product ON "stock_items"("product_id");

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "contact_name" varchar(255),
  "email" varchar(255),
  "phone" varchar(50),
  "address" jsonb DEFAULT '{}',
  "abn" varchar(20),
  "payment_terms" integer NOT NULL DEFAULT 30,
  "lead_time_days" integer NOT NULL DEFAULT 7,
  "preferred_currency" varchar(3) NOT NULL DEFAULT 'AUD',
  "notes" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_suppliers_org_id ON "suppliers"("org_id");

CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id"),
  "po_number" varchar(100) NOT NULL,
  "status" po_status NOT NULL DEFAULT 'draft',
  "currency" varchar(3) NOT NULL DEFAULT 'AUD',
  "exchange_rate" numeric(10,6) NOT NULL DEFAULT 1,
  "payment_terms" integer NOT NULL DEFAULT 30,
  "expected_delivery_at" timestamptz,
  "notes" text,
  "subtotal" numeric(12,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(12,4) NOT NULL DEFAULT 0,
  "total" numeric(12,4) NOT NULL DEFAULT 0,
  "sent_at" timestamptz,
  "created_by_employee_id" uuid NOT NULL,
  "approved_by_employee_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_orders_org_id ON "purchase_orders"("org_id");
CREATE UNIQUE INDEX idx_purchase_orders_org_number ON "purchase_orders"("org_id", "po_number");

CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "product_name" varchar(255) NOT NULL,
  "sku" varchar(100) NOT NULL,
  "ordered_qty" numeric(12,3) NOT NULL,
  "received_qty" numeric(12,3) NOT NULL DEFAULT 0,
  "unit_cost" numeric(12,4) NOT NULL,
  "tax_rate" numeric(8,4) NOT NULL DEFAULT 0,
  "line_total" numeric(12,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS "stock_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "transfer_number" varchar(100) NOT NULL,
  "from_location_id" uuid NOT NULL,
  "to_location_id" uuid NOT NULL,
  "status" transfer_status NOT NULL DEFAULT 'requested',
  "requested_by_employee_id" uuid NOT NULL,
  "approved_by_employee_id" uuid,
  "dispatched_at" timestamptz,
  "received_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stock_transfer_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transfer_id" uuid NOT NULL REFERENCES "stock_transfers"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "product_name" varchar(255) NOT NULL,
  "sku" varchar(100) NOT NULL,
  "requested_qty" numeric(12,3) NOT NULL,
  "dispatched_qty" numeric(12,3) NOT NULL DEFAULT 0,
  "received_qty" numeric(12,3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "stock_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "before_qty" numeric(12,3) NOT NULL,
  "after_qty" numeric(12,3) NOT NULL,
  "adjustment" numeric(12,3) NOT NULL,
  "reason" varchar(255) NOT NULL,
  "reference_id" uuid,
  "reference_type" varchar(50),
  "employee_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_adjustments_org ON "stock_adjustments"("org_id", "location_id");
