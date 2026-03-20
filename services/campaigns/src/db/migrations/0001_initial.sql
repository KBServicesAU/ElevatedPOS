CREATE TYPE campaign_type AS ENUM ('email', 'sms', 'push', 'discount', 'points_multiplier');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'active', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "type" campaign_type NOT NULL,
  "status" campaign_status NOT NULL DEFAULT 'draft',
  "target_segment" jsonb NOT NULL DEFAULT '{}',
  "scheduled_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_org_id ON "campaigns"("org_id");
CREATE INDEX idx_campaigns_status ON "campaigns"("status");

CREATE TABLE IF NOT EXISTS "campaign_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "subject" text,
  "body" text NOT NULL,
  "sent_at" timestamptz,
  "recipient_count" integer NOT NULL DEFAULT 0,
  "open_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_messages_campaign ON "campaign_messages"("campaign_id");
