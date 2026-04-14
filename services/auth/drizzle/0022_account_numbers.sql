-- ============================================================
-- Migration 0022: Organisation account numbers
-- ============================================================
-- Adds a 9-digit zero-padded sequential account number to each
-- organisation.  The sequence is DB-level so concurrent inserts
-- never race.  Existing orgs are back-filled in creation order.
-- ============================================================

-- ── Sequence ──────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS "org_account_number_seq"
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "account_number" varchar(9)
    UNIQUE
    DEFAULT LPAD(nextval('org_account_number_seq')::text, 9, '0');

-- ── Back-fill existing rows (in creation order) ───────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM "organisations"
    WHERE "account_number" IS NULL
    ORDER BY "created_at" ASC
  LOOP
    UPDATE "organisations"
    SET "account_number" = LPAD(nextval('org_account_number_seq')::text, 9, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- Make NOT NULL now that every row has a value
ALTER TABLE "organisations"
  ALTER COLUMN "account_number" SET NOT NULL;

-- Index for fast lookup by support team
CREATE INDEX IF NOT EXISTS "organisations_account_number_idx"
  ON "organisations" ("account_number");
