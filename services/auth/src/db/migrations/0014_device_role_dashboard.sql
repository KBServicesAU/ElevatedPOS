-- Migration: 0014_device_role_dashboard
-- Adds 'dashboard' to the device_role enum so dashboard APKs can be paired.

ALTER TYPE device_role ADD VALUE IF NOT EXISTS 'dashboard';
