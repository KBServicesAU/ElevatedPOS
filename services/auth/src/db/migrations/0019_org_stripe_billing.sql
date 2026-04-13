-- Add Stripe billing columns to organisations table
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255),
  ADD COLUMN IF NOT EXISTS settings jsonb;
