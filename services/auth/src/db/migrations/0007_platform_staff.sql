DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_role') THEN
    CREATE TYPE platform_role AS ENUM ('superadmin', 'support', 'reseller');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role platform_role NOT NULL DEFAULT 'support',
  reseller_org_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Seed the initial superadmin (password: 'changeme123' — bcrypt hash)
INSERT INTO platform_staff (email, password_hash, first_name, last_name, role)
VALUES ('admin@elevatedpos.com.au', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Platform', 'Admin', 'superadmin')
ON CONFLICT (email) DO NOTHING;
