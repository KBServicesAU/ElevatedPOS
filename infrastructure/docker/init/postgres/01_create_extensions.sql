-- Enable extensions needed by ElevatedPOS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create schemas per service
CREATE SCHEMA IF NOT EXISTS elevatedpos_auth;
CREATE SCHEMA IF NOT EXISTS elevatedpos_catalog;
CREATE SCHEMA IF NOT EXISTS elevatedpos_inventory;
CREATE SCHEMA IF NOT EXISTS elevatedpos_orders;
CREATE SCHEMA IF NOT EXISTS elevatedpos_payments;
CREATE SCHEMA IF NOT EXISTS elevatedpos_customers;
CREATE SCHEMA IF NOT EXISTS elevatedpos_loyalty;
CREATE SCHEMA IF NOT EXISTS elevatedpos_campaigns;
CREATE SCHEMA IF NOT EXISTS elevatedpos_integrations;
CREATE SCHEMA IF NOT EXISTS elevatedpos_automations;
CREATE SCHEMA IF NOT EXISTS elevatedpos_audit;
