-- Migration: 0015_device_role_display
-- Adds 'display' to the device_role enum for digital signage screens.

ALTER TYPE device_role ADD VALUE IF NOT EXISTS 'display';
