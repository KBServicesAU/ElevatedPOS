-- Migration 0007: EFTPOS Payment Intents
-- Stores TIM API payment lifecycle for crash recovery and audit.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eftpos_intent_state') THEN
    CREATE TYPE eftpos_intent_state AS ENUM (
      'created',
      'initializing_terminal',
      'awaiting_terminal_ready',
      'sent_to_terminal',
      'awaiting_cardholder',
      'authorizing',
      'approved_pending_commit',
      'approved',
      'declined',
      'cancel_requested',
      'cancelled',
      'failed_retryable',
      'failed_terminal',
      'unknown_outcome',
      'recovery_required'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS eftpos_payment_intents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL,
  location_id       UUID,
  device_id         UUID,
  pos_order_id      VARCHAR(255) NOT NULL,
  amount_cents      INTEGER     NOT NULL,
  currency          VARCHAR(3)  NOT NULL DEFAULT 'AUD',
  state             eftpos_intent_state NOT NULL DEFAULT 'created',
  state_history     JSONB       NOT NULL DEFAULT '[]',
  tim_correlation_id VARCHAR(255),
  result_approved   BOOLEAN,
  result_code       VARCHAR(50),
  auth_code         VARCHAR(50),
  card_last4        VARCHAR(4),
  card_scheme       VARCHAR(50),
  rrn               VARCHAR(50),
  stan              VARCHAR(50),
  terminal_ip       VARCHAR(45),
  terminal_port     INTEGER,
  terminal_label    VARCHAR(255),
  merchant_receipt  TEXT,
  customer_receipt  TEXT,
  support_log       JSONB       NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_eftpos_intents_org_id
  ON eftpos_payment_intents (org_id);

CREATE INDEX IF NOT EXISTS idx_eftpos_intents_pos_order_id
  ON eftpos_payment_intents (org_id, pos_order_id);

CREATE INDEX IF NOT EXISTS idx_eftpos_intents_state
  ON eftpos_payment_intents (state)
  WHERE state NOT IN ('approved', 'declined', 'cancelled', 'failed_retryable');

CREATE INDEX IF NOT EXISTS idx_eftpos_intents_created_at
  ON eftpos_payment_intents (created_at DESC);
