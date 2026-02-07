-- Final fix for business_users recursion - simplified SELECT policy
-- Run this in Supabase SQL Editor

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view business memberships" ON business_users;
DROP POLICY IF EXISTS "Business owners can manage users" ON business_users;
DROP POLICY IF EXISTS "Business owners can delete users" ON business_users;
DROP POLICY IF EXISTS "Users can create their own business membership" ON business_users;
DROP POLICY IF EXISTS "Users can view their business memberships" ON business_users;
DROP POLICY IF EXISTS "Users can create their own membership" ON business_users;
DROP POLICY IF EXISTS "Users can view their memberships" ON business_users;
DROP POLICY IF EXISTS "Owners can update memberships" ON business_users;
DROP POLICY IF EXISTS "Owners can delete memberships" ON business_users;
DROP POLICY IF EXISTS "Admins can manage business users" ON business_users;

-- Policy 1: Users can INSERT their own membership
CREATE POLICY "Insert own membership"
  ON business_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Users can SELECT ONLY their own membership row
-- KEY FIX: No subqueries, no recursion - just check user_id
CREATE POLICY "Select own membership"
  ON business_users FOR SELECT
  USING (user_id = auth.uid());

-- Policy 3: Business owners can UPDATE memberships in their business
CREATE POLICY "Owners update memberships"
  ON business_users FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Policy 4: Business owners can DELETE memberships in their business
CREATE POLICY "Owners delete memberships"
  ON business_users FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
