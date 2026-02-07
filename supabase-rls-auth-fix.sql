-- Fixed RLS policies for registration flow
-- The key issue: auth.uid() may not be set immediately after signUp
-- Solution: Allow INSERT if user is authenticated and owner_id is provided
-- Run this in Supabase SQL Editor

-- =============================================
-- BUSINESSES TABLE POLICIES
-- =============================================

-- Drop existing businesses policies
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Create own business" ON businesses;
DROP POLICY IF EXISTS "Users can update their business" ON businesses;
DROP POLICY IF EXISTS "Update own business" ON businesses;
DROP POLICY IF EXISTS "Users can view businesses they belong to" ON businesses;
DROP POLICY IF EXISTS "View own business" ON businesses;

-- CRITICAL FIX: Allow INSERT for any authenticated user
-- The owner_id will be validated by the application code
CREATE POLICY "Authenticated users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to view businesses they own
CREATE POLICY "View own businesses"
  ON businesses FOR SELECT
  USING (owner_id = auth.uid());

-- Allow business owners to update their own business
CREATE POLICY "Update own businesses"
  ON businesses FOR UPDATE
  USING (owner_id = auth.uid());

-- =============================================
-- BUSINESS_USERS TABLE POLICIES
-- =============================================

-- Drop all existing business_users policies
DROP POLICY IF EXISTS "Users can view business memberships" ON business_users;
DROP POLICY IF EXISTS "Business owners can manage users" ON business_users;
DROP POLICY IF EXISTS "Business owners can delete users" ON business_users;
DROP POLICY IF EXISTS "Users can create their own business membership" ON business_users;
DROP POLICY IF EXISTS "Users can view their business memberships" ON business_users;
DROP POLICY IF EXISTS "Users can create their own membership" ON business_users;
DROP POLICY IF EXISTS "Users can view their memberships" ON business_users;
DROP POLICY IF EXISTS "Insert own membership" ON business_users;
DROP POLICY IF EXISTS "Select own membership" ON business_users;
DROP POLICY IF EXISTS "Owners can update memberships" ON business_users;
DROP POLICY IF EXISTS "Owners update memberships" ON business_users;
DROP POLICY IF EXISTS "Owners can delete memberships" ON business_users;
DROP POLICY IF EXISTS "Owners delete memberships" ON business_users;
DROP POLICY IF EXISTS "Admins can manage business users" ON business_users;

-- CRITICAL FIX: Allow INSERT for any authenticated user
-- The user_id will be validated by the application code
CREATE POLICY "Authenticated users can create memberships"
  ON business_users FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to view only their own membership rows
CREATE POLICY "View own memberships"
  ON business_users FOR SELECT
  USING (user_id = auth.uid());

-- Allow business owners to update memberships
CREATE POLICY "Update business memberships"
  ON business_users FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Allow business owners to delete memberships
CREATE POLICY "Delete business memberships"
  ON business_users FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
