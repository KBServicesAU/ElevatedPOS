CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual', 'one_time');
CREATE TYPE membership_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');

CREATE TABLE IF NOT EXISTS "membership_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "price" numeric(10, 2) NOT NULL,
  "billing_cycle" billing_cycle NOT NULL,
  "benefits" jsonb NOT NULL DEFAULT '[]',
  "points_multiplier" numeric(5, 2) NOT NULL DEFAULT 1.00,
  "tier_override" varchar(100),
  "is_active" boolean NOT NULL DEFAULT true,
  "trial_days" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_plans_org ON "membership_plans"("org_id");
CREATE INDEX idx_membership_plans_org_active ON "membership_plans"("org_id", "is_active");

CREATE TABLE IF NOT EXISTS "membership_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "membership_plans"("id"),
  "status" membership_status NOT NULL DEFAULT 'active',
  "current_period_start" timestamptz NOT NULL,
  "current_period_end" timestamptz NOT NULL,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "payment_method_ref" text,
  "dunning_attempts" integer NOT NULL DEFAULT 0,
  "last_dunning_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_subs_org ON "membership_subscriptions"("org_id");
CREATE INDEX idx_membership_subs_customer ON "membership_subscriptions"("org_id", "customer_id");
CREATE INDEX idx_membership_subs_status ON "membership_subscriptions"("org_id", "status");
