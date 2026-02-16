-- Fix RLS policies so invited team members can see business data
-- The "View own business" policy currently only allows the owner to see the business.
-- This updates it to allow any business member to see and update the business.

-- Step 1: Fix businesses SELECT policy (currently owner-only)
DROP POLICY IF EXISTS "View own business" ON businesses;
DROP POLICY IF EXISTS "Users can view businesses they belong to" ON businesses;

CREATE POLICY "View business as member" ON businesses
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT public.get_my_business_ids())
  );

-- Step 2: Fix businesses UPDATE policy (currently owner-only)
DROP POLICY IF EXISTS "Update own business" ON businesses;
DROP POLICY IF EXISTS "Users can update their business" ON businesses;

CREATE POLICY "Update business as member" ON businesses
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR id IN (SELECT public.get_my_business_ids())
  );

-- Step 3: Ensure data tables also use get_my_business_ids for members
-- The original migration created auth.user_business_ids() but we can't
-- write to the auth schema. Check if it exists and create/update if needed.
-- If auth.user_business_ids doesn't exist, the data table policies won't work
-- for any user. We'll create a public version and update the policies.

-- First check: do the data table policies already work?
-- They reference auth.user_business_ids() from the original migration.
-- If that function exists, members can already see data.
-- If not, we need to recreate it in public schema and update all policies.

-- Create or replace the public helper (safe to re-run)
CREATE OR REPLACE FUNCTION public.get_my_business_ids()
RETURNS SETOF UUID AS $$
  SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- If auth.user_business_ids doesn't exist, update ALL data table policies
-- to use public.get_my_business_ids() instead.
-- Run the block below ONLY if you get errors about auth.user_business_ids not existing.

-- Categories
DROP POLICY IF EXISTS "Users can view their business categories" ON categories;
DROP POLICY IF EXISTS "Users can manage their business categories" ON categories;
CREATE POLICY "View business categories" ON categories FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));
CREATE POLICY "Manage business categories" ON categories FOR ALL
  USING (business_id IN (SELECT public.get_my_business_ids()));

-- Products
DROP POLICY IF EXISTS "Users can view their business products" ON products;
DROP POLICY IF EXISTS "Users can manage their business products" ON products;
CREATE POLICY "View business products" ON products FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));
CREATE POLICY "Manage business products" ON products FOR ALL
  USING (business_id IN (SELECT public.get_my_business_ids()));

-- Customers
DROP POLICY IF EXISTS "Users can view their business customers" ON customers;
DROP POLICY IF EXISTS "Users can manage their business customers" ON customers;
CREATE POLICY "View business customers" ON customers FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));
CREATE POLICY "Manage business customers" ON customers FOR ALL
  USING (business_id IN (SELECT public.get_my_business_ids()));

-- Orders
DROP POLICY IF EXISTS "Users can view their business orders" ON orders;
DROP POLICY IF EXISTS "Users can manage their business orders" ON orders;
CREATE POLICY "View business orders" ON orders FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));
CREATE POLICY "Manage business orders" ON orders FOR ALL
  USING (business_id IN (SELECT public.get_my_business_ids()));

-- Order items (through parent order)
DROP POLICY IF EXISTS "Users can view order items" ON order_items;
DROP POLICY IF EXISTS "Users can manage order items" ON order_items;
CREATE POLICY "View order items" ON order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM orders WHERE business_id IN (SELECT public.get_my_business_ids())
  ));
CREATE POLICY "Manage order items" ON order_items FOR ALL
  USING (order_id IN (
    SELECT id FROM orders WHERE business_id IN (SELECT public.get_my_business_ids())
  ));

-- Ledger entries
DROP POLICY IF EXISTS "Users can view their business ledger" ON ledger_entries;
DROP POLICY IF EXISTS "Users can manage their business ledger" ON ledger_entries;
CREATE POLICY "View business ledger" ON ledger_entries FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));
CREATE POLICY "Manage business ledger" ON ledger_entries FOR ALL
  USING (business_id IN (SELECT public.get_my_business_ids()));

-- Inventory movements
DROP POLICY IF EXISTS "Users can view their business inventory movements" ON inventory_movements;
DROP POLICY IF EXISTS "Users can manage their business inventory movements" ON inventory_movements;
CREATE POLICY "View business inventory" ON inventory_movements FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));
CREATE POLICY "Manage business inventory" ON inventory_movements FOR ALL
  USING (business_id IN (SELECT public.get_my_business_ids()));
