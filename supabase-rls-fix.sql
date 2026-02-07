-- Fix for RLS Policy Issue on Businesses Table
-- Run this in Supabase SQL Editor to allow users to create their own businesses

-- Drop the old policy
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;

-- Create new policy that allows users to create businesses where they are the owner
CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- Also ensure users can read businesses where they are the owner even before joining business_users
DROP POLICY IF EXISTS "Users can view businesses they belong to" ON businesses;

CREATE POLICY "Users can view businesses they belong to"
  ON businesses FOR SELECT
  USING (
    id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
  );
