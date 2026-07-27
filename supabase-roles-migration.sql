-- supabase-roles-migration.sql
-- Adds multi-role support to business_users + has_role() helper.
ALTER TABLE business_users
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE business_users
  ADD CONSTRAINT business_users_roles_valid
  CHECK (roles <@ ARRAY['admin','operations','sales','accounts']::text[]);

-- Backfill: every existing owner becomes admin.
UPDATE business_users SET roles = ARRAY['admin'] WHERE role = 'owner' AND roles = '{}';

-- true if the CURRENT auth user has check_role (or is admin) in ANY active membership.
CREATE OR REPLACE FUNCTION public.has_role(check_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.active
      AND (check_role = ANY(bu.roles) OR 'admin' = ANY(bu.roles))
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
