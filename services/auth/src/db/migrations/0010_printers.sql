DO $$ BEGIN
  CREATE TYPE printer_connection_type AS ENUM ('ip', 'usb');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE printer_type AS ENUM ('receipt', 'kitchen_order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE printer_destination_type AS ENUM ('none', 'kitchen', 'bar', 'front', 'back', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "printers" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "location_id"        uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "name"               varchar(100) NOT NULL,
  "brand"              varchar(50) NOT NULL DEFAULT 'generic',
  "connection_type"    printer_connection_type NOT NULL DEFAULT 'ip',
  "host"               varchar(255),
  "port"               integer DEFAULT 9100,
  "printer_type"       printer_type NOT NULL DEFAULT 'receipt',
  "destination"        printer_destination_type NOT NULL DEFAULT 'none',
  "custom_destination" varchar(100),
  "is_active"          boolean NOT NULL DEFAULT true,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);
