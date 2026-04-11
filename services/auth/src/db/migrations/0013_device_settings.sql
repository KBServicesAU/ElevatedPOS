-- Add a JSONB settings column to devices so per-device config
-- (customer display messages, etc.) can be managed from the dashboard
-- and synced to any client that pairs with that device.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS settings jsonb;
