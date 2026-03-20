CREATE TABLE IF NOT EXISTS "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email" varchar(255),
  "phone" varchar(50),
  "dob" date,
  "gender" varchar(20),
  "address_line1" varchar(255),
  "suburb" varchar(100),
  "state" varchar(50),
  "postcode" varchar(20),
  "country" varchar(2) DEFAULT 'AU',
  "company" varchar(255),
  "abn" varchar(20),
  "tags" jsonb NOT NULL DEFAULT '[]',
  "marketing_opt_in" boolean NOT NULL DEFAULT false,
  "marketing_opt_in_at" timestamptz,
  "household_id" uuid,
  "rfm_score" varchar(10),
  "lifetime_value" numeric(12,4) NOT NULL DEFAULT 0,
  "visit_count" integer NOT NULL DEFAULT 0,
  "last_purchase_at" timestamptz,
  "churn_risk_score" numeric(5,4),
  "preferred_language" varchar(10) DEFAULT 'en',
  "dietary_preferences" jsonb NOT NULL DEFAULT '[]',
  "allergen_alerts" jsonb NOT NULL DEFAULT '[]',
  "notes" text,
  "source" varchar(50) DEFAULT 'pos',
  "gdpr_deleted" boolean NOT NULL DEFAULT false,
  "gdpr_deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_org_id ON "customers"("org_id");
CREATE INDEX idx_customers_email ON "customers"("org_id", "email") WHERE email IS NOT NULL;
CREATE INDEX idx_customers_phone ON "customers"("org_id", "phone") WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_last_name ON "customers"("org_id", "last_name");

CREATE TABLE IF NOT EXISTS "store_credit_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "balance" numeric(12,4) NOT NULL DEFAULT 0,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "store_credit_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "store_credit_accounts"("id"),
  "org_id" uuid NOT NULL,
  "type" varchar(50) NOT NULL,
  "amount" numeric(12,4) NOT NULL,
  "order_id" uuid,
  "notes" text,
  "employee_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sc_transactions_account ON "store_credit_transactions"("account_id");
