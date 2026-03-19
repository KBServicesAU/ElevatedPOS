CREATE TABLE IF NOT EXISTS "organisations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "country" varchar(2) NOT NULL DEFAULT 'AU',
  "currency" varchar(3) NOT NULL DEFAULT 'AUD',
  "timezone" varchar(100) NOT NULL DEFAULT 'Australia/Sydney',
  "plan" varchar(50) NOT NULL DEFAULT 'starter',
  "plan_status" varchar(50) NOT NULL DEFAULT 'active',
  "white_label_theme_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "description" text,
  "is_system_role" boolean NOT NULL DEFAULT false,
  "permissions" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255),
  "pin" varchar(255),
  "role_id" uuid REFERENCES "roles"("id"),
  "location_ids" jsonb NOT NULL DEFAULT '[]',
  "employment_type" varchar(50) NOT NULL DEFAULT 'full_time',
  "start_date" timestamptz,
  "end_date" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "mfa_enabled" boolean NOT NULL DEFAULT false,
  "mfa_secret" varchar(255),
  "failed_login_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "employees_org_email_idx" ON "employees"("org_id", "email");

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "token_hash" varchar(255) NOT NULL UNIQUE,
  "device_id" varchar(255),
  "device_name" varchar(255),
  "ip_address" varchar(45),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Seed system roles
INSERT INTO "roles" ("id", "name", "is_system_role", "permissions") VALUES
  (gen_random_uuid(), 'owner', true, '{"*": true}'),
  (gen_random_uuid(), 'admin', true, '{"sale.process": true, "sale.discount.apply": true, "sale.refund.process": true, "sale.void": true, "catalog.edit": true, "inventory.manage": true, "staff.manage": true, "reports.view": true, "settings.manage": true}'),
  (gen_random_uuid(), 'manager', true, '{"sale.process": true, "sale.discount.apply": true, "sale.refund.process": true, "sale.void": true, "catalog.edit": true, "inventory.manage": true, "staff.manage": true, "reports.view": true}'),
  (gen_random_uuid(), 'supervisor', true, '{"sale.process": true, "sale.discount.apply": true, "sale.refund.process": true, "sale.void": true, "reports.view": true}'),
  (gen_random_uuid(), 'cashier', true, '{"sale.process": true, "sale.discount.apply_limited": true}'),
  (gen_random_uuid(), 'server', true, '{"sale.process": true, "sale.discount.apply_limited": true}'),
  (gen_random_uuid(), 'bartender', true, '{"sale.process": true, "sale.discount.apply_limited": true}'),
  (gen_random_uuid(), 'kitchen', true, '{"kds.view": true, "kds.bump": true}'),
  (gen_random_uuid(), 'inventory_controller', true, '{"inventory.manage": true, "catalog.edit": true}'),
  (gen_random_uuid(), 'marketer', true, '{"campaigns.manage": true, "customers.view": true, "loyalty.manage": true}'),
  (gen_random_uuid(), 'finance', true, '{"reports.view": true, "reports.export": true}');
