-- Migration: 0004_surcharge_rules_and_invoices.sql
-- Adds surcharge_rules, invoices, and invoice_lines tables.

CREATE TABLE IF NOT EXISTS surcharge_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL,
  payment_method     VARCHAR(50) NOT NULL,
  card_type          VARCHAR(50),
  surcharge_percent  NUMERIC(6,4) NOT NULL,
  min_amount         NUMERIC(12,4),
  max_amount         NUMERIC(12,4),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surcharge_rules_org_id ON surcharge_rules (org_id);

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL,
  invoice_number   VARCHAR(30) NOT NULL UNIQUE,
  customer_id      UUID,
  order_id         UUID,
  status           invoice_status NOT NULL DEFAULT 'draft',
  subtotal         NUMERIC(12,4) NOT NULL,
  tax_amount       NUMERIC(12,4) NOT NULL DEFAULT 0,
  total            NUMERIC(12,4) NOT NULL,
  currency         VARCHAR(3) NOT NULL DEFAULT 'AUD',
  due_date         TIMESTAMPTZ NOT NULL,
  payment_terms    VARCHAR(100),
  notes            TEXT,
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  payment_id       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_id      ON invoices (org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON invoices (org_id, status);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  qty          NUMERIC(10,4) NOT NULL,
  unit_price   NUMERIC(12,4) NOT NULL,
  tax_rate     NUMERIC(6,4) NOT NULL DEFAULT 0,
  line_total   NUMERIC(12,4) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines (invoice_id);
