-- ============================================================
-- Migration 0005: Reservations + reservation settings
-- ============================================================
-- Supports both restaurant (party-size + table) and service
-- (staff + duration) bookings, with optional deposit via
-- ElevatedPOS Pay (Stripe Connect).
-- ============================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "reservation_status" AS ENUM (
    'pending', 'confirmed', 'seated', 'in_progress',
    'completed', 'cancelled', 'no_show'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "deposit_status" AS ENUM (
    'none', 'pending', 'paid', 'refunded', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── reservations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "reservations" (
  "id"                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                      uuid        NOT NULL,
  "location_id"                 uuid,
  -- 'restaurant' | 'service'
  "booking_type"                varchar(20) NOT NULL DEFAULT 'restaurant',
  -- Restaurant fields
  "party_size"                  integer,
  "table_id"                    uuid,
  -- Service / appointment fields
  "service_id"                  uuid,
  "staff_employee_id"           uuid,
  "duration_minutes"            integer,
  -- Shared customer fields
  "customer_name"               varchar(255) NOT NULL,
  "customer_email"              varchar(255) NOT NULL,
  "customer_phone"              varchar(50),
  "scheduled_at"                timestamptz  NOT NULL,
  "ends_at"                     timestamptz,
  "status"                      "reservation_status" NOT NULL DEFAULT 'pending',
  "notes"                       text,
  "internal_notes"              text,
  -- Deposit (Stripe Connect)
  "deposit_status"              "deposit_status" NOT NULL DEFAULT 'none',
  "deposit_amount_cents"        integer     NOT NULL DEFAULT 0,
  "deposit_stripe_account_id"   varchar(255),
  "deposit_payment_intent_id"   varchar(255),
  "deposit_paid_at"             timestamptz,
  "deposit_refunded_at"         timestamptz,
  -- Tracking
  "source"                      varchar(30) NOT NULL DEFAULT 'widget',
  "reminder_sent_at"            timestamptz,
  "cancelled_at"                timestamptz,
  "cancellation_reason"         text,
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "updated_at"                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reservations_org_scheduled_idx"
  ON "reservations" ("org_id", "scheduled_at");

CREATE INDEX IF NOT EXISTS "reservations_org_status_idx"
  ON "reservations" ("org_id", "status");

-- ── reservation_settings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "reservation_settings" (
  "id"                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                      uuid        NOT NULL UNIQUE,
  "restaurant_enabled"          boolean     NOT NULL DEFAULT false,
  "service_enabled"             boolean     NOT NULL DEFAULT false,
  "restaurant_deposit_required" boolean     NOT NULL DEFAULT false,
  "restaurant_deposit_cents"    integer     NOT NULL DEFAULT 0,
  "service_deposit_required"    boolean     NOT NULL DEFAULT false,
  "service_deposit_cents"       integer     NOT NULL DEFAULT 0,
  "advance_booking_days"        integer     NOT NULL DEFAULT 60,
  "slot_interval_minutes"       integer     NOT NULL DEFAULT 30,
  "opening_hours"               jsonb       NOT NULL DEFAULT '{}',
  "widget_primary_color"        varchar(7)  NOT NULL DEFAULT '#6366f1',
  "widget_logo_url"             text,
  "widget_title"                varchar(255) DEFAULT 'Book a Table',
  "confirmation_email_enabled"  boolean     NOT NULL DEFAULT true,
  "reminder_email_enabled"      boolean     NOT NULL DEFAULT true,
  "reminder_hours_before"       integer     NOT NULL DEFAULT 24,
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "updated_at"                  timestamptz NOT NULL DEFAULT now()
);
