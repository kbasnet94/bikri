-- supabase-customer-type-is-business.sql
-- Spec: docs/superpowers/specs/2026-08-02-payment-status-defaults-export-integrity-design.md
-- 1) Schema: wholesale/credit flag on customer types.
ALTER TABLE customer_types
  ADD COLUMN IF NOT EXISTS is_business boolean NOT NULL DEFAULT false;

-- 2) One-time config (Hydralyte business only): wholesale types default to Credit.
-- is_business is per-business config, not a global type property — scope the
-- UPDATE to the owning business so other tenants' customer_types rows are untouched.
UPDATE customer_types SET is_business = true
WHERE lower(name) IN ('gym', 'retail', 'pharmacy')
  AND business_id = '136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c';

-- Sanity: expect Gym/Retail/Pharmacy true, Consumer false (Hydralyte business only).
-- SELECT name, is_business FROM customer_types WHERE business_id = '136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c' ORDER BY name;
