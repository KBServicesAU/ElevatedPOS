-- v2.7.48 — terminal_transactions table for ANZ Worldline TIM API
-- certification submission (and ongoing audit). Every interaction with
-- the ANZ terminal — purchase, refund, reversal, reconcile, logon,
-- logoff — produces one row, regardless of outcome (approved /
-- declined / cancelled / error / timeout). The mobile bridge posts a
-- row before resolving the JS promise so even network failures after
-- the terminal already authed are captured for forensic replay.
--
-- ANZ cert evidence requirement: merchants must be able to download
-- the full log (JSON or CSV) alongside test videos + receipts.

CREATE TABLE IF NOT EXISTS "terminal_transactions" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            uuid NOT NULL,
  "location_id"       uuid,
  "device_id"         uuid,
  "order_id"          uuid,
  "reference_id"      text,
  "provider"          varchar(20) NOT NULL DEFAULT 'anz',
  "outcome"           varchar(20) NOT NULL,
  "amount_cents"      integer,
  "transaction_type"  varchar(20),
  "transaction_ref"   text,
  "auth_code"         text,
  "rrn"               text,
  "masked_pan"        text,
  "card_type"         text,
  "error_category"    text,
  "error_code"        integer,
  "error_message"     text,
  "error_step"        text,
  "merchant_receipt"  text,
  "customer_receipt"  text,
  "duration_ms"       integer,
  "tim_capabilities"  jsonb,
  "raw"               jsonb,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "terminal_tx_org_idx"
  ON "terminal_transactions" ("org_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "terminal_tx_order_idx"
  ON "terminal_transactions" ("order_id");
