CREATE TABLE IF NOT EXISTS "roster_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organisations" ("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees" ("id"),
  "date" date NOT NULL,
  "start_time" varchar(5) NOT NULL,
  "end_time" varchar(5) NOT NULL,
  "role" varchar(100),
  "station" varchar(100),
  "published" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "roster_shifts_org_date_idx" ON "roster_shifts" ("org_id", "date");
CREATE INDEX IF NOT EXISTS "roster_shifts_org_employee_idx" ON "roster_shifts" ("org_id", "employee_id");
