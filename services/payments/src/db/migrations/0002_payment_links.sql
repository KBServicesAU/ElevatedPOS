-- Migration: 0002_payment_links
-- Adds payment_links, bnpl_transactions tables and required enum types

CREATE TYPE payment_link_status AS ENUM ('pending', 'paid', 'expired', 'cancelled');
CREATE TYPE bnpl_provider AS ENUM ('afterpay', 'zip', 'humm', 'latitude');
CREATE TYPE bnpl_status AS ENUM ('pending', 'approved', 'declined', 'settled', 'refunded');

CREATE TABLE IF NOT EXISTS "payment_links" (
  "id"           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid         NOT NULL,
  "location_id"  uuid         NOT NULL,
  "amount"       numeric(12,4) NOT NULL,
  "currency"     text         NOT NULL DEFAULT 'AUD',
  "description"  text         NOT NULL,
  "reference"    text,
  "customer_id"  uuid,
  "status"       payment_link_status NOT NULL DEFAULT 'pending',
  "expires_at"   timestamptz  NOT NULL,
  "paid_at"      timestamptz,
  "payment_id"   uuid,
  "short_code"   varchar(8)   NOT NULL UNIQUE,
  "metadata"     jsonb,
  "created_at"   timestamptz  NOT NULL DEFAULT now(),
  "updated_at"   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_links_org_id    ON "payment_links"("org_id");
CREATE INDEX idx_payment_links_status    ON "payment_links"("status");
CREATE INDEX idx_payment_links_short_code ON "payment_links"("short_code");
CREATE INDEX idx_payment_links_expires_at ON "payment_links"("expires_at");

CREATE TABLE IF NOT EXISTS "bnpl_transactions" (
  "id"                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                 uuid         NOT NULL,
  "order_id"               uuid         NOT NULL,
  "provider"               bnpl_provider NOT NULL,
  "status"                 bnpl_status  NOT NULL DEFAULT 'pending',
  "amount"                 numeric(12,4) NOT NULL,
  "token"                  text,
  "redirect_url"           text,
  "provider_transaction_id" text,
  "settled_at"             timestamptz,
  "created_at"             timestamptz  NOT NULL DEFAULT now(),
  "updated_at"             timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_bnpl_transactions_org_id   ON "bnpl_transactions"("org_id");
CREATE INDEX idx_bnpl_transactions_order_id ON "bnpl_transactions"("order_id");
CREATE INDEX idx_bnpl_transactions_provider ON "bnpl_transactions"("provider");
CREATE INDEX idx_bnpl_transactions_status   ON "bnpl_transactions"("status");
CREATE INDEX idx_bnpl_transactions_token    ON "bnpl_transactions"("token");
