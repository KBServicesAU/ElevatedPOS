-- Enums
CREATE TYPE "approval_type" AS ENUM ('discount', 'refund', 'void', 'cash_disbursement', 'stock_adjustment', 'other');
CREATE TYPE "approval_status" AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE "clock_event_type" AS ENUM ('clock_in', 'clock_out', 'break_start', 'break_end');
CREATE TYPE "shift_status" AS ENUM ('open', 'closed', 'approved');

-- Approval Requests
CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "type" "approval_type" NOT NULL,
  "status" "approval_status" NOT NULL DEFAULT 'pending',
  "requested_by" uuid NOT NULL REFERENCES "employees"("id"),
  "approved_by" uuid REFERENCES "employees"("id"),
  "location_id" uuid NOT NULL,
  "amount" numeric(12, 2),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "reason" text NOT NULL,
  "approver_note" text,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "approval_requests_org_status_idx" ON "approval_requests"("org_id", "status");
CREATE INDEX "approval_requests_expires_at_idx" ON "approval_requests"("expires_at");

-- Clock Events
CREATE TABLE IF NOT EXISTS "clock_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "location_id" uuid NOT NULL,
  "register_id" uuid,
  "type" "clock_event_type" NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  "latitude" numeric(10, 7),
  "longitude" numeric(10, 7),
  "notes" text,
  "edited_by" uuid REFERENCES "employees"("id"),
  "edited_at" timestamptz,
  "edit_reason" text,
  "is_manual" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "clock_events_org_employee_idx" ON "clock_events"("org_id", "employee_id");
CREATE INDEX "clock_events_timestamp_idx" ON "clock_events"("timestamp");

-- Shifts
CREATE TABLE IF NOT EXISTS "shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "location_id" uuid NOT NULL,
  "clock_in_at" timestamptz NOT NULL,
  "clock_out_at" timestamptz,
  "break_minutes" integer NOT NULL DEFAULT 0,
  "total_minutes" integer,
  "status" "shift_status" NOT NULL DEFAULT 'open',
  "approved_by" uuid REFERENCES "employees"("id"),
  "approved_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "shifts_org_employee_idx" ON "shifts"("org_id", "employee_id");
CREATE INDEX "shifts_org_status_idx" ON "shifts"("org_id", "status");
CREATE INDEX "shifts_clock_in_at_idx" ON "shifts"("clock_in_at");
