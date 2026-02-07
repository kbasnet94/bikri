-- Complete RLS fix for businesses and business_users tables
-- This ensures registration works without recursion
-- Run this in Supabase SQL Editor

-- =============================================
-- BUSINESSES TABLE POLICIES
-- =============================================

-- Drop existing businesses policies
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Users can update their business" ON businesses;
DROP POLICY IF EXISTS "Users can view businesses they belong to" ON businesses;

-- Allow authenticated users to create businesses where they are the owner
CREATE POLICY "Create own business"
  ON businesses FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND owner_id = auth.uid()
  );

-- Allow users to view businesses they own
-- No subquery to business_users to avoid circular dependency
CREATE POLICY "View own business"
  ON businesses FOR SELECT
  USING (owner_id = auth.uid());

-- Allow business owners to update their own business
CREATE POLICY "Update own business"
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

-- Allow users to insert their own membership
CREATE POLICY "Insert own membership"
  ON business_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow users to view only their own membership rows
CREATE POLICY "Select own membership"
  ON business_users FOR SELECT
  USING (user_id = auth.uid());

-- Allow business owners to update memberships
CREATE POLICY "Owners update memberships"
  ON business_users FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Allow business owners to delete memberships
CREATE POLICY "Owners delete memberships"
  ON business_users FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
