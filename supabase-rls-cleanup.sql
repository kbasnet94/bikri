-- Clean up duplicate and old RLS policies for business_users
-- Run this in Supabase SQL Editor

-- Drop ALL old and duplicate policies explicitly
DROP POLICY IF EXISTS "Users can view business memberships" ON business_users;
DROP POLICY IF EXISTS "Business owners can manage users" ON business_users;
DROP POLICY IF EXISTS "Business owners can delete users" ON business_users;
DROP POLICY IF EXISTS "Users can create their own business membership" ON business_users;
DROP POLICY IF EXISTS "Users can view their business memberships" ON business_users;
DROP POLICY IF EXISTS "Owners can update memberships" ON business_users;
DROP POLICY IF EXISTS "Owners can delete memberships" ON business_users;
DROP POLICY IF EXISTS "Admins can manage business users" ON business_users;

-- Now create the correct policies

-- Policy 1: Allow users to INSERT their own membership during registration
-- KEY FIX: Only check user_id = auth.uid() to avoid recursion
CREATE POLICY "Users can create their own membership"
  ON business_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Users can VIEW memberships for businesses they belong to
CREATE POLICY "Users can view their memberships"
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
-- Check via businesses table to avoid recursion
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
