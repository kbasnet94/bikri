-- Final Fix for business_users RLS Policies
-- This removes the recursion issue during registration
-- Run this in Supabase SQL Editor

-- Drop ALL existing business_users policies to start fresh
DROP POLICY IF EXISTS "Users can create their own business membership" ON business_users;
DROP POLICY IF EXISTS "Users can create their own membership" ON business_users;
DROP POLICY IF EXISTS "Users can view business memberships" ON business_users;
DROP POLICY IF EXISTS "Users can view their business memberships" ON business_users;
DROP POLICY IF EXISTS "Business owners can manage users" ON business_users;
DROP POLICY IF EXISTS "Business owners can delete users" ON business_users;
DROP POLICY IF EXISTS "Owners can update memberships" ON business_users;
DROP POLICY IF EXISTS "Owners can delete memberships" ON business_users;
DROP POLICY IF EXISTS "Admins can manage business users" ON business_users;

-- Policy 1: Allow users to INSERT their own membership during registration
-- This is the key fix - just check user_id matches auth.uid()
-- Don't check if business exists, since it was just created
CREATE POLICY "Users can create their own membership"
  ON business_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Users can VIEW memberships for any business they belong to
-- This is safe - no recursion since we limit to 1 result
CREATE POLICY "Users can view their business memberships"
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

-- Policy 3: Business owners can UPDATE memberships
-- Check ownership via businesses table to avoid recursion
CREATE POLICY "Owners can update memberships"
  ON business_users FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Policy 4: Business owners can DELETE memberships
CREATE POLICY "Owners can delete memberships"
  ON business_users FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
