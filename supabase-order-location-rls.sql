-- Patch: order-linked delivery pins are written by ops at order-processing
-- time, so the admin/accounts write gate applies only to customer BRANCH
-- locations (order_id IS NULL). Order-linked rows (order_id IS NOT NULL)
-- are writable by any business member.

DROP POLICY "Admin/accounts add locations" ON customer_locations;
DROP POLICY "Admin/accounts update locations" ON customer_locations;
DROP POLICY "Admin/accounts delete locations" ON customer_locations;

CREATE POLICY "Location writes: branch=admin/accounts, order pin=any member"
  ON customer_locations FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    AND (order_id IS NOT NULL OR has_role('admin') OR has_role('accounts'))
  );

CREATE POLICY "Location updates: branch=admin/accounts, order pin=any member"
  ON customer_locations FOR UPDATE TO authenticated
  USING (
    business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    AND (order_id IS NOT NULL OR has_role('admin') OR has_role('accounts'))
  );

CREATE POLICY "Location deletes: branch=admin/accounts, order pin=any member"
  ON customer_locations FOR DELETE TO authenticated
  USING (
    business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    AND (order_id IS NOT NULL OR has_role('admin') OR has_role('accounts'))
  );
