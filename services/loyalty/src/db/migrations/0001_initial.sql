CREATE TYPE loyalty_tx_type AS ENUM ('earn', 'redeem', 'adjustment', 'expiry');

CREATE TABLE IF NOT EXISTS "loyalty_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "earn_rate" integer NOT NULL DEFAULT 10,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_loyalty_programs_org ON "loyalty_programs"("org_id");

CREATE TABLE IF NOT EXISTS "loyalty_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "program_id" uuid NOT NULL REFERENCES "loyalty_programs"("id"),
  "name" varchar(100) NOT NULL,
  "min_points" integer NOT NULL,
  "max_points" integer,
  "multiplier" numeric(4,2) NOT NULL DEFAULT 1.00,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "loyalty_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "program_id" uuid NOT NULL REFERENCES "loyalty_programs"("id"),
  "points" integer NOT NULL DEFAULT 0,
  "lifetime_points" integer NOT NULL DEFAULT 0,
  "tier_id" uuid REFERENCES "loyalty_tiers"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_loyalty_accounts_customer_program ON "loyalty_accounts"("org_id", "customer_id", "program_id");

CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "loyalty_accounts"("id"),
  "order_id" uuid,
  "type" loyalty_tx_type NOT NULL,
  "points" integer NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX loyalty_tx_org_idempotency_key ON "loyalty_transactions"("org_id", "idempotency_key");
CREATE INDEX idx_loyalty_tx_account ON "loyalty_transactions"("account_id");
