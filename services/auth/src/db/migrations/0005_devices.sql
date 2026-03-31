-- Migration: 0005_devices
-- Adds device pairing infrastructure

CREATE TYPE device_role AS ENUM ('pos', 'kds', 'kiosk');
CREATE TYPE device_status AS ENUM ('active', 'revoked');

CREATE TABLE device_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code VARCHAR(8) NOT NULL UNIQUE,
  role device_role NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  register_id UUID,
  label VARCHAR(100),
  created_by UUID NOT NULL REFERENCES employees(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_pairing_codes_code ON device_pairing_codes(code);
CREATE INDEX idx_device_pairing_codes_org_id ON device_pairing_codes(org_id);
CREATE INDEX idx_device_pairing_codes_expires_at ON device_pairing_codes(expires_at);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  role device_role NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  register_id UUID,
  label VARCHAR(100),
  platform VARCHAR(20),
  app_version VARCHAR(20),
  last_seen_at TIMESTAMPTZ,
  status device_status NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_org_id ON devices(org_id);
CREATE INDEX idx_devices_token_hash ON devices(token_hash);
CREATE INDEX idx_devices_location_id ON devices(location_id);
CREATE INDEX idx_devices_status ON devices(status);

-- Auto-clean expired unused pairing codes (optional, handled by TTL in app)
-- but useful for DB hygiene
CREATE INDEX idx_device_pairing_codes_cleanup ON device_pairing_codes(expires_at, used_at);
