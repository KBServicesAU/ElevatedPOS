-- Migration: 0003_fulfillment_requests.sql
-- Adds fulfillment_requests table for click-and-collect, ship-from-store, and endless-aisle flows.

DO $$ BEGIN
  CREATE TYPE fulfillment_type AS ENUM ('click_and_collect', 'ship_from_store', 'endless_aisle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_status AS ENUM ('pending', 'picked', 'packed', 'ready', 'dispatched', 'collected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fulfillment_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL,
  order_id                  UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type                      fulfillment_type NOT NULL,
  status                    fulfillment_status NOT NULL DEFAULT 'pending',
  assigned_to_employee_id   UUID,
  source_location_id        UUID NOT NULL,
  destination_location_id   UUID,
  shipping_label            TEXT,
  tracking_number           TEXT,
  shipping_carrier          TEXT,
  pick_requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_at                 TIMESTAMPTZ,
  packed_at                 TIMESTAMPTZ,
  ready_at                  TIMESTAMPTZ,
  dispatched_at             TIMESTAMPTZ,
  collected_at              TIMESTAMPTZ,
  customer_notified_at      TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_requests_org_id   ON fulfillment_requests (org_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_requests_order_id ON fulfillment_requests (order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_requests_status   ON fulfillment_requests (org_id, status);
