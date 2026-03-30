-- Migration 0002: Lay-by agreements, gift cards, and quotes

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE layby_status AS ENUM ('active', 'paid', 'cancelled');
CREATE TYPE layby_payment_method AS ENUM ('cash', 'card', 'eftpos', 'bank_transfer', 'store_credit');
CREATE TYPE gift_card_status AS ENUM ('active', 'depleted', 'expired', 'cancelled');
CREATE TYPE gift_card_transaction_type AS ENUM ('issue', 'topup', 'redeem', 'void', 'expiry');
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'expired', 'cancelled');

-- ── Lay-by agreements ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "layby_agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "order_id" uuid,
  "agreement_number" text NOT NULL UNIQUE,
  "status" layby_status NOT NULL DEFAULT 'active',
  "total_amount" numeric(12,4) NOT NULL,
  "deposit_amount" numeric(12,4) NOT NULL,
  "balance_owing" numeric(12,4) NOT NULL,
  "cancellation_fee" numeric(12,4) NOT NULL DEFAULT 0,
  "payment_schedule" jsonb NOT NULL DEFAULT '[]',
  "items" jsonb NOT NULL DEFAULT '[]',
  "customer_name" text NOT NULL,
  "customer_address" text NOT NULL,
  "cancellation_policy" text,
  "notes" text,
  "activated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_layby_agreements_org_id ON "layby_agreements"("org_id");
CREATE INDEX idx_layby_agreements_customer_id ON "layby_agreements"("customer_id");
CREATE INDEX idx_layby_agreements_location_id ON "layby_agreements"("location_id");
CREATE INDEX idx_layby_agreements_status ON "layby_agreements"("status");
CREATE INDEX idx_layby_agreements_created_at ON "layby_agreements"("created_at" DESC);

-- ── Lay-by payments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "layby_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "layby_id" uuid NOT NULL REFERENCES "layby_agreements"("id") ON DELETE CASCADE,
  "amount" numeric(12,4) NOT NULL,
  "method" layby_payment_method NOT NULL,
  "reference" text,
  "paid_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_layby_payments_layby_id ON "layby_payments"("layby_id");
CREATE INDEX idx_layby_payments_paid_at ON "layby_payments"("paid_at" DESC);

-- ── Gift cards ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "gift_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "code" text NOT NULL UNIQUE,
  "original_amount" numeric(12,4) NOT NULL,
  "current_balance" numeric(12,4) NOT NULL,
  "currency" text NOT NULL DEFAULT 'AUD',
  "status" gift_card_status NOT NULL DEFAULT 'active',
  "customer_id" uuid,
  "issued_by_employee_id" uuid,
  "expires_at" timestamptz,
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gift_cards_org_id ON "gift_cards"("org_id");
CREATE INDEX idx_gift_cards_code ON "gift_cards"("code");
CREATE INDEX idx_gift_cards_customer_id ON "gift_cards"("customer_id");
CREATE INDEX idx_gift_cards_status ON "gift_cards"("status");

-- ── Gift card transactions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "gift_card_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gift_card_id" uuid NOT NULL REFERENCES "gift_cards"("id") ON DELETE CASCADE,
  "order_id" uuid,
  "amount" numeric(12,4) NOT NULL,
  "type" gift_card_transaction_type NOT NULL,
  "reference" text,
  "performed_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gift_card_transactions_gift_card_id ON "gift_card_transactions"("gift_card_id");
CREATE INDEX idx_gift_card_transactions_order_id ON "gift_card_transactions"("order_id");
CREATE INDEX idx_gift_card_transactions_created_at ON "gift_card_transactions"("created_at" DESC);

-- ── Quotes ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "customer_id" uuid,
  "quote_number" text NOT NULL UNIQUE,
  "status" quote_status NOT NULL DEFAULT 'draft',
  "items" jsonb NOT NULL DEFAULT '[]',
  "subtotal" numeric(12,4) NOT NULL DEFAULT 0,
  "discount_total" numeric(12,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(12,4) NOT NULL DEFAULT 0,
  "total" numeric(12,4) NOT NULL DEFAULT 0,
  "discount_percent" numeric(8,4),
  "notes" text,
  "valid_until" timestamptz NOT NULL,
  "converted_to_order_id" uuid,
  "sent_at" timestamptz,
  "accepted_at" timestamptz,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotes_org_id ON "quotes"("org_id");
CREATE INDEX idx_quotes_customer_id ON "quotes"("customer_id");
CREATE INDEX idx_quotes_location_id ON "quotes"("location_id");
CREATE INDEX idx_quotes_status ON "quotes"("status");
CREATE INDEX idx_quotes_created_at ON "quotes"("created_at" DESC);
CREATE INDEX idx_quotes_valid_until ON "quotes"("valid_until");
