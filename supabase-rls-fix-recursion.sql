-- Fix Infinite Recursion in business_users RLS Policy
-- Run this in Supabase SQL Editor

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can manage business users" ON business_users;

-- Create separate policies for different operations to avoid recursion

-- Policy 1: Users can INSERT their own business membership (for registration)
CREATE POLICY "Users can create their own business membership"
  ON business_users FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- Policy 2: Users can VIEW business_users for their business
CREATE POLICY "Users can view business memberships"
  ON business_users FOR SELECT
  USING (
    user_id = auth.uid() 
    OR business_id IN (
      SELECT bu.business_id 
      FROM business_users bu 
      WHERE bu.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Policy 3: Owners can manage users (UPDATE/DELETE)
-- Use the businesses table directly to avoid recursion
CREATE POLICY "Business owners can manage users"
  ON business_users FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Business owners can delete users"
  ON business_users FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
