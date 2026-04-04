ALTER TABLE "order_lines"
  ADD COLUMN IF NOT EXISTS "kds_destination" varchar(50);
