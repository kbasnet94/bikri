-- supabase-roles-rls.sql
-- Lock 1: manual ledger writes require accounts/admin; order-linked writes stay open to members.
CREATE POLICY ledger_manual_insert_accounts ON ledger_entries
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (order_id IS NOT NULL OR has_role('accounts'));
CREATE POLICY ledger_manual_update_accounts ON ledger_entries
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (order_id IS NOT NULL OR has_role('accounts'));
CREATE POLICY ledger_manual_delete_accounts ON ledger_entries
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (order_id IS NOT NULL OR has_role('accounts'));

-- Lock 2: only admins manage memberships/roles.
CREATE POLICY business_users_write_admin_ins ON business_users
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (has_role('admin'));
CREATE POLICY business_users_write_admin_upd ON business_users
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (has_role('admin'));
CREATE POLICY business_users_write_admin_del ON business_users
  AS RESTRICTIVE FOR DELETE TO authenticated USING (has_role('admin'));
