-- Migration: 0002_stamps_and_multipliers.sql
-- Adds points multiplier events, stamp/punch-card programs, customer stamp cards, and stamp events.

CREATE TABLE IF NOT EXISTS points_multiplier_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  name          VARCHAR(255) NOT NULL,
  multiplier    NUMERIC(5,2) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days_of_week  JSONB NOT NULL DEFAULT '[]',
  product_ids   JSONB DEFAULT NULL,
  category_ids  JSONB DEFAULT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multiplier_events_org_id   ON points_multiplier_events (org_id);
CREATE INDEX IF NOT EXISTS idx_multiplier_events_active   ON points_multiplier_events (org_id, is_active);

DO $$ BEGIN
  CREATE TYPE stamp_card_status AS ENUM ('active', 'completed', 'expired', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stamp_programs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  stamps_required  INTEGER NOT NULL,
  reward           VARCHAR(255) NOT NULL,
  reward_value     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_days      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stamp_programs_org_id ON stamp_programs (org_id);

CREATE TABLE IF NOT EXISTS customer_stamp_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  customer_id     UUID NOT NULL,
  program_id      UUID NOT NULL REFERENCES stamp_programs(id) ON DELETE CASCADE,
  current_stamps  INTEGER NOT NULL DEFAULT 0,
  status          stamp_card_status NOT NULL DEFAULT 'active',
  expires_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stamp_cards_org_id       ON customer_stamp_cards (org_id);
CREATE INDEX IF NOT EXISTS idx_stamp_cards_customer_id  ON customer_stamp_cards (customer_id);
CREATE INDEX IF NOT EXISTS idx_stamp_cards_program_id   ON customer_stamp_cards (program_id);

CREATE TABLE IF NOT EXISTS stamp_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  card_id     UUID NOT NULL REFERENCES customer_stamp_cards(id) ON DELETE CASCADE,
  order_id    UUID,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stamp_events_card_id ON stamp_events (card_id);
