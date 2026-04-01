-- Migration: Stripe Connect accounts, subscriptions, and invoices tables
-- Supports ElevatedPOS white-label platform with 1% application fee

CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL UNIQUE,
  stripe_account_id     varchar(255) NOT NULL UNIQUE,
  status                varchar(50)  NOT NULL DEFAULT 'pending',
  charges_enabled       boolean      NOT NULL DEFAULT false,
  payouts_enabled       boolean      NOT NULL DEFAULT false,
  details_submitted     boolean      NOT NULL DEFAULT false,
  business_name         varchar(255),
  business_type         varchar(100),
  country               varchar(2)   NOT NULL DEFAULT 'AU',
  currency              varchar(3)   NOT NULL DEFAULT 'aud',
  platform_fee_percent  integer      NOT NULL DEFAULT 100, -- basis points (100 = 1%)
  onboarding_url        text,
  onboarding_expires_at timestamptz,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_org_id
  ON stripe_connect_accounts (org_id);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid        NOT NULL,
  stripe_account_id       varchar(255) NOT NULL,
  stripe_subscription_id  varchar(255) NOT NULL UNIQUE,
  stripe_customer_id      varchar(255) NOT NULL,
  stripe_price_id         varchar(255) NOT NULL,
  customer_id             uuid,
  status                  varchar(50)  NOT NULL,
  current_period_start    timestamptz  NOT NULL,
  current_period_end      timestamptz  NOT NULL,
  cancel_at_period_end    boolean      NOT NULL DEFAULT false,
  metadata                jsonb        NOT NULL DEFAULT '{}',
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_org_id
  ON stripe_subscriptions (org_id);

CREATE TABLE IF NOT EXISTS stripe_invoices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL,
  stripe_account_id   varchar(255) NOT NULL,
  stripe_invoice_id   varchar(255) NOT NULL UNIQUE,
  stripe_customer_id  varchar(255) NOT NULL,
  customer_id         uuid,
  status              varchar(50)  NOT NULL,
  amount_due          integer      NOT NULL,
  amount_paid         integer      NOT NULL DEFAULT 0,
  currency            varchar(3)   NOT NULL DEFAULT 'aud',
  due_date            timestamptz,
  invoice_url         text,
  invoice_pdf         text,
  metadata            jsonb        NOT NULL DEFAULT '{}',
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_org_id
  ON stripe_invoices (org_id);
