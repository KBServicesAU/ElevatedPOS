-- Migration: Customer Groups, Notes, and enhanced Store Credit
-- 0002_groups_notes_credits.sql

-- Add new columns to store_credit_transactions
ALTER TABLE store_credit_transactions
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issued_by UUID;

-- Make employee_id nullable (some system-issued credits have no employee)
ALTER TABLE store_credit_transactions
  ALTER COLUMN employee_id DROP NOT NULL;

-- Customer Groups
CREATE TABLE IF NOT EXISTS customer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_automatic BOOLEAN NOT NULL DEFAULT FALSE,
  rules JSONB NOT NULL DEFAULT '[]',
  member_count INTEGER NOT NULL DEFAULT 0,
  last_computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_groups_org_id ON customer_groups(org_id);

-- Customer Group Members (junction table)
CREATE TABLE IF NOT EXISTS customer_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_group_members_group_id ON customer_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_customer_group_members_customer_id ON customer_group_members(customer_id);

-- Customer Notes
CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'general',
  employee_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_org_id ON customer_notes(org_id);
