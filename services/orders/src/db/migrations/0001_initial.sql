CREATE TYPE order_status AS ENUM ('open', 'held', 'completed', 'cancelled', 'refunded', 'partially_refunded');
CREATE TYPE order_type AS ENUM ('retail', 'dine_in', 'takeaway', 'delivery', 'pickup', 'layby', 'quote');
CREATE TYPE order_channel AS ENUM ('pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone');
CREATE TYPE line_status AS ENUM ('pending', 'sent_to_kitchen', 'ready', 'served', 'void', 'comp');
CREATE TYPE refund_method AS ENUM ('original', 'store_credit', 'cash', 'exchange');

CREATE TABLE IF NOT EXISTS "orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "register_id" uuid NOT NULL,
  "order_number" varchar(50) NOT NULL,
  "channel" order_channel NOT NULL DEFAULT 'pos',
  "channel_reference" varchar(255),
  "order_type" order_type NOT NULL DEFAULT 'retail',
  "status" order_status NOT NULL DEFAULT 'open',
  "customer_id" uuid,
  "employee_id" uuid NOT NULL,
  "table_id" uuid,
  "covers" integer,
  "subtotal" numeric(12,4) NOT NULL DEFAULT 0,
  "discount_total" numeric(12,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(12,4) NOT NULL DEFAULT 0,
  "total" numeric(12,4) NOT NULL DEFAULT 0,
  "paid_total" numeric(12,4) NOT NULL DEFAULT 0,
  "change_given" numeric(12,4) NOT NULL DEFAULT 0,
  "notes" text,
  "receipt_sent_at" timestamptz,
  "receipt_channel" varchar(50),
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancellation_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_org_id ON "orders"("org_id");
CREATE INDEX idx_orders_location_id ON "orders"("location_id");
CREATE INDEX idx_orders_customer_id ON "orders"("customer_id");
CREATE INDEX idx_orders_status ON "orders"("status");
CREATE INDEX idx_orders_created_at ON "orders"("created_at" DESC);
CREATE UNIQUE INDEX idx_orders_org_number ON "orders"("org_id", "order_number");

CREATE TABLE IF NOT EXISTS "order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "name" varchar(255) NOT NULL,
  "sku" varchar(100) NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit_price" numeric(12,4) NOT NULL,
  "cost_price" numeric(12,4) NOT NULL DEFAULT 0,
  "tax_rate" numeric(8,4) NOT NULL DEFAULT 0,
  "tax_amount" numeric(12,4) NOT NULL DEFAULT 0,
  "discount_amount" numeric(12,4) NOT NULL DEFAULT 0,
  "line_total" numeric(12,4) NOT NULL,
  "modifiers" jsonb NOT NULL DEFAULT '[]',
  "seat_number" integer,
  "course" varchar(50),
  "notes" text,
  "status" line_status NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_lines_order_id ON "order_lines"("order_id");

CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "original_order_id" uuid NOT NULL REFERENCES "orders"("id"),
  "refund_number" varchar(50) NOT NULL,
  "reason" text NOT NULL,
  "lines" jsonb NOT NULL DEFAULT '[]',
  "refund_method" refund_method NOT NULL,
  "total_amount" numeric(12,4) NOT NULL,
  "approved_by_employee_id" uuid NOT NULL,
  "processed_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_org_id ON "refunds"("org_id");
