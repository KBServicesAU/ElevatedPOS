ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS max_pos_devices      integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_kds_devices      integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_kiosk_devices    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_dashboard_devices integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_display_devices  integer NOT NULL DEFAULT 5;

-- Give the owner/demo org unlimited counts for all roles
UPDATE organisations
SET max_pos_devices=9999, max_kds_devices=9999, max_kiosk_devices=9999,
    max_dashboard_devices=9999, max_display_devices=9999
WHERE id='00000000-0000-0000-0000-000000000001';
