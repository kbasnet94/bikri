-- supabase-customer-type-is-business.sql
-- Spec: docs/superpowers/specs/2026-08-02-payment-status-defaults-export-integrity-design.md
-- 1) Schema: wholesale/credit flag on customer types.
ALTER TABLE customer_types
  ADD COLUMN IF NOT EXISTS is_business boolean NOT NULL DEFAULT false;

-- 2) One-time config (Hydralyte business): wholesale types default to Credit.
UPDATE customer_types SET is_business = true
WHERE lower(name) IN ('gym', 'retail', 'pharmacy');

-- Sanity: expect Gym/Retail/Pharmacy true, Consumer false.
-- SELECT name, is_business FROM customer_types ORDER BY name;
