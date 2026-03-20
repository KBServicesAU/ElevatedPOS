CREATE TYPE payment_method AS ENUM ('card', 'cash', 'store_credit', 'gift_card', 'voucher', 'bnpl', 'split');
CREATE TYPE payment_status AS ENUM ('pending', 'approved', 'declined', 'void', 'refunded');

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "method" payment_method NOT NULL,
  "amount" numeric(12,4) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'AUD',
  "exchange_rate" numeric(10,6) NOT NULL DEFAULT 1,
  "tip_amount" numeric(12,4) NOT NULL DEFAULT 0,
  "surcharge_amount" numeric(12,4) NOT NULL DEFAULT 0,
  "terminal_id" uuid,
  "acquirer" varchar(100),
  "acquirer_transaction_id" varchar(255),
  "card_scheme" varchar(50),
  "card_last4" varchar(4),
  "auth_code" varchar(50),
  "status" payment_status NOT NULL DEFAULT 'pending',
  "is_offline" boolean NOT NULL DEFAULT false,
  "metadata" jsonb DEFAULT '{}',
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order_id ON "payments"("order_id");
CREATE INDEX idx_payments_org_id ON "payments"("org_id");
CREATE INDEX idx_payments_status ON "payments"("status");

CREATE TABLE IF NOT EXISTS "settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "acquirer" varchar(100) NOT NULL,
  "settlement_date" timestamptz NOT NULL,
  "total_sales" numeric(12,4) NOT NULL,
  "total_refunds" numeric(12,4) NOT NULL,
  "total_surcharges" numeric(12,4) NOT NULL,
  "net_amount" numeric(12,4) NOT NULL,
  "transaction_count" integer NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "bank_deposited_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_settlements_org_id ON "settlements"("org_id");
