-- Franchise control plane schema

CREATE TYPE royalty_calculation AS ENUM ('gross_sales', 'net_sales', 'revenue');
CREATE TYPE billing_cycle AS ENUM ('weekly', 'monthly');
CREATE TYPE franchise_location_status AS ENUM ('active', 'suspended', 'terminated');
CREATE TYPE field_lock_type AS ENUM ('locked', 'store_managed', 'hq_default');
CREATE TYPE royalty_statement_status AS ENUM ('draft', 'issued', 'paid', 'disputed');
CREATE TYPE compliance_check_status AS ENUM ('compliant', 'non_compliant', 'pending');

CREATE TABLE IF NOT EXISTS franchise_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  royalty_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  royalty_calculation royalty_calculation NOT NULL DEFAULT 'gross_sales',
  billing_cycle billing_cycle NOT NULL DEFAULT 'monthly',
  royalty_start_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS franchise_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES franchise_groups(id),
  location_id UUID NOT NULL,
  franchisee_org_id UUID NOT NULL,
  franchisee_contact_name VARCHAR(255),
  franchisee_email VARCHAR(255),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status franchise_location_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_lock_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES franchise_groups(id),
  field_path TEXT NOT NULL,
  lock_type field_lock_type NOT NULL,
  locked_value JSONB,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS royalty_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES franchise_groups(id),
  location_id UUID NOT NULL,
  period VARCHAR(7) NOT NULL,
  gross_sales NUMERIC(14,4) NOT NULL DEFAULT 0,
  net_sales NUMERIC(14,4) NOT NULL DEFAULT 0,
  royalty_rate NUMERIC(5,4) NOT NULL,
  royalty_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  status royalty_statement_status NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS network_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES franchise_groups(id),
  location_id UUID NOT NULL,
  check_type TEXT NOT NULL,
  status compliance_check_status NOT NULL DEFAULT 'pending',
  details JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franchise_groups_org_id ON franchise_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_franchise_locations_group_id ON franchise_locations(group_id);
CREATE INDEX IF NOT EXISTS idx_field_lock_policies_group_id ON field_lock_policies(group_id);
CREATE INDEX IF NOT EXISTS idx_royalty_statements_group_id ON royalty_statements(group_id);
CREATE INDEX IF NOT EXISTS idx_royalty_statements_period ON royalty_statements(period);
CREATE INDEX IF NOT EXISTS idx_network_compliance_checks_group_id ON network_compliance_checks(group_id);
