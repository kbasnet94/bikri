-- Fix business_users SELECT policy
-- Creates a SECURITY DEFINER helper function in the public schema to avoid
-- infinite recursion, then uses it in the policy so team members can see each other.

-- Step 1: Create helper function that bypasses RLS
CREATE OR REPLACE FUNCTION public.get_my_business_ids()
RETURNS SETOF UUID AS $$
  SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Step 2: Replace the SELECT policy
DROP POLICY IF EXISTS "Select own membership" ON business_users;
DROP POLICY IF EXISTS "Select business memberships" ON business_users;

CREATE POLICY "Select business memberships" ON business_users
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT public.get_my_business_ids())
  );
