-- ============================================================
-- Migration 0025: system_audit_logs
-- ============================================================
-- v2.7.48-univlog — every server mutation across every service is
-- captured into one cross-service table so the merchant + Godmode
-- support staff can investigate "who changed what, and when".
--
-- This is distinct from the existing `audit_logs` table, which only
-- records godmode platform-staff actions (logged by hand from
-- specific routes). `system_audit_logs` is wider:
--
--   * Captured by a Fastify onResponse hook in @nexus/fastify-audit,
--     registered in every backend service. POST/PATCH/PUT/DELETE only.
--   * Carries before/after diff so a row update is reversible by a
--     human reading the log.
--   * Carries actor type so employee, device-paired POS, godmode
--     staff, and system events live in one stream.
--
-- Columns chosen for the dashboard "Activity" tab on the merchant
-- and Godmode Logs pages: filter by org, actor, action, entity_type,
-- date range; click row → JSON diff panel.
-- ============================================================

CREATE TABLE IF NOT EXISTS "system_audit_logs" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid,                                -- nullable for godmode-only actions
  "location_id"   uuid,
  -- Actor
  "actor_type"    varchar(20) NOT NULL,                -- 'employee' | 'device' | 'godmode_staff' | 'system' | 'customer'
  "actor_id"      uuid,
  "actor_name"    text,                                -- denormalised for fast filter (resolved at write time)
  -- Action
  "action"        varchar(20) NOT NULL,                -- 'create' | 'update' | 'delete' | 'login' | 'logout' | 'auth_fail'
  "entity_type"   varchar(50) NOT NULL,                -- 'order' | 'product' | 'customer' | …
  "entity_id"     text,                                -- not always uuid (settings keys are strings)
  "entity_name"   text,                                -- human-readable label, denormalised
  -- Diff
  "before_json"   jsonb,
  "after_json"    jsonb,
  -- HTTP
  "endpoint"      text,
  "method"        varchar(10),
  "status_code"   integer,
  "ip_address"    text,
  "user_agent"    text,
  -- Optional context
  "service"       varchar(50),                         -- 'orders' | 'auth' | 'catalog' | …
  "notes"         text,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "system_audit_org_idx"
  ON "system_audit_logs" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "system_audit_actor_idx"
  ON "system_audit_logs" ("actor_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "system_audit_entity_idx"
  ON "system_audit_logs" ("entity_type", "entity_id");
