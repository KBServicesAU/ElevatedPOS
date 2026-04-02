-- Platform subscriptions: ElevatedPOS billing merchants
CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL UNIQUE,
  external_customer_id   VARCHAR(255) NOT NULL UNIQUE,
  external_subscription_id VARCHAR(255) UNIQUE,
  external_price_id      VARCHAR(255),
  plan                   VARCHAR(50)  NOT NULL DEFAULT 'starter',
  status                 VARCHAR(50)  NOT NULL DEFAULT 'trialing',
  trial_ends_at          TIMESTAMPTZ,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN      NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_subs_org_id ON platform_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_platform_subs_ext_sub ON platform_subscriptions(external_subscription_id);
