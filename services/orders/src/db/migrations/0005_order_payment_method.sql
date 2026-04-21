-- v2.7.24 — record the tender used to settle each order so the EOD
-- summary endpoint can split sales into Cash / Card / Other buckets.
-- Nullable: pre-v2.7.24 rows don't have a value and the EOD endpoint
-- treats null as 'other'.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" text;
