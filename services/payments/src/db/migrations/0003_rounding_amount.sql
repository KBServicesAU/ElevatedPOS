-- Migration: 0003_rounding_amount.sql
-- Adds rounding_amount column to payments table.
-- Used for cash rounding (e.g., AUD 5-cent rounding).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS rounding_amount NUMERIC(12,4) NOT NULL DEFAULT 0;
