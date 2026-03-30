-- Locations migration

CREATE TYPE "location_type" AS ENUM ('retail', 'warehouse', 'kitchen');

CREATE TABLE IF NOT EXISTS "locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "address" jsonb DEFAULT '{}',
  "phone" varchar(50),
  "timezone" varchar(100) NOT NULL DEFAULT 'Australia/Sydney',
  "type" "location_type" NOT NULL DEFAULT 'retail',
  "settings" jsonb NOT NULL DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "locations_org_id_idx" ON "locations"("org_id");
CREATE INDEX "locations_org_type_idx" ON "locations"("org_id", "type");
CREATE INDEX "locations_org_active_idx" ON "locations"("org_id", "is_active");
