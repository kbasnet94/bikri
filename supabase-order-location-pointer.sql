-- Location model v2 (2026-07-29): pins live ONLY in customer_locations;
-- orders POINT at one of their customer's pins instead of owning a pin.
-- Rationale: one data source for the map, no duplicate pins for repeat D2C
-- customers, truthful history (an order's pin never silently moves), and
-- B2B orders point at the delivery point (distribution hub) since clients
-- fan out to branches themselves (per Abhi: split is unknown to us).

-- NOTE: policies referencing order_id must drop BEFORE the column drop
-- (first attempt failed on dependency order; this version is rerun-safe).

DROP POLICY IF EXISTS "Location writes: branch=admin/accounts, order pin=any member" ON customer_locations;
DROP POLICY IF EXISTS "Location updates: branch=admin/accounts, order pin=any member" ON customer_locations;
DROP POLICY IF EXISTS "Location deletes: branch=admin/accounts, order pin=any member" ON customer_locations;
DROP POLICY IF EXISTS "Admin/accounts add locations" ON customer_locations;
DROP POLICY IF EXISTS "Admin/accounts update locations" ON customer_locations;
DROP POLICY IF EXISTS "Admin/accounts delete locations" ON customer_locations;

DROP INDEX IF EXISTS customer_locations_one_per_order;
ALTER TABLE customer_locations DROP COLUMN IF EXISTS order_id;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES customer_locations(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel TEXT; -- 'instagram' | 'facebook' | 'daraz' (D2C only)
CREATE INDEX IF NOT EXISTS orders_location_idx ON orders(location_id);

CREATE OR REPLACE FUNCTION check_customer_location_cap()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT count(*) FROM customer_locations
    WHERE customer_id = NEW.customer_id
  ) >= 10 THEN
    RAISE EXCEPTION 'A customer can have at most 10 locations';
  END IF;
  RETURN NEW;
END $$;

CREATE POLICY "Members add locations"
  ON customer_locations FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin/accounts update locations"
  ON customer_locations FOR UPDATE TO authenticated
  USING (
    business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    AND (has_role('admin') OR has_role('accounts'))
  );

CREATE POLICY "Admin/accounts delete locations"
  ON customer_locations FOR DELETE TO authenticated
  USING (
    business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    AND (has_role('admin') OR has_role('accounts'))
  );
