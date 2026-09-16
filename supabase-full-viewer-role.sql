-- supabase-full-viewer-role.sql
-- Adds the read-only 'full_viewer' role and locks every business-data write to writer roles.
-- Run once in the Supabase SQL Editor (after supabase-roles-migration.sql / supabase-roles-rls.sql).

-- 1. Allow the new role value.
ALTER TABLE business_users DROP CONSTRAINT IF EXISTS business_users_roles_valid;
ALTER TABLE business_users
  ADD CONSTRAINT business_users_roles_valid
  CHECK (roles <@ ARRAY['admin','operations','sales','accounts','full_viewer']::text[]);

-- 2. can_write(): true if the CURRENT auth user holds any writer role in an active membership.
--    NOTE: has_role('full_viewer') would be true for admins too, so we test writer roles positively.
CREATE OR REPLACE FUNCTION public.can_write()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.active
      AND bu.roles && ARRAY['admin','operations','sales','accounts']::text[]
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_write() TO authenticated;

-- 3. RESTRICTIVE write policies: a full_viewer-only user can SELECT but never INSERT/UPDATE/DELETE.
--    RESTRICTIVE policies AND with the existing permissive membership policies, so nothing else changes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'businesses','categories','products','product_variants','customers','customer_types',
    'customer_locations','orders','order_items','ledger_entries','inventory_movements'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write_requires_writer_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write_requires_writer_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write_requires_writer_del', t);
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (can_write())', t || '_write_requires_writer_ins', t);
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR UPDATE TO authenticated USING (can_write())', t || '_write_requires_writer_upd', t);
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR DELETE TO authenticated USING (can_write())', t || '_write_requires_writer_del', t);
  END LOOP;
END $$;

-- Verify (optional):
-- SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE '%write_requires_writer%' ORDER BY 1,2;
