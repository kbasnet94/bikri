-- Sub-project 3: customer_locations — geodata for the sales map.
-- One customer = up to 10 named locations (branches), captured via Google
-- Places autocomplete. Daraz orders additionally get ONE end-customer
-- location per order (order_id set), keyed by ops at processing time.
-- The customers.address free-text field is untouched — this table is the
-- single geodata source for the heatmap across all channels.

CREATE TABLE customer_locations (
  id BIGSERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- NULL = a customer branch location; set = the end-customer location for
  -- that specific order (Daraz flow). At most one location per order.
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  label TEXT,                        -- e.g. "Bhatbhateni Baluwatar"
  formatted_address TEXT NOT NULL,   -- as returned by Places/Geocoding
  place_id TEXT,                     -- Google place_id (NULL for manual pins later)
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'places',  -- 'places' | 'geocode' | 'manual'
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX customer_locations_customer_idx ON customer_locations(customer_id);
CREATE INDEX customer_locations_business_idx ON customer_locations(business_id);
CREATE UNIQUE INDEX customer_locations_one_per_order
  ON customer_locations(order_id) WHERE order_id IS NOT NULL;

-- Cap branch locations at 10 per customer (order-linked rows don't count).
CREATE OR REPLACE FUNCTION check_customer_location_cap()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_id IS NULL AND (
    SELECT count(*) FROM customer_locations
    WHERE customer_id = NEW.customer_id AND order_id IS NULL
  ) >= 10 THEN
    RAISE EXCEPTION 'A customer can have at most 10 locations';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER customer_locations_cap
  BEFORE INSERT ON customer_locations
  FOR EACH ROW EXECUTE FUNCTION check_customer_location_cap();

-- RLS: business-scoped reads for every member; writes are admin/accounts
-- only for now (Karan, 2026-07-28). Sales reps will get write access scoped
-- to clients they own once My Clients / rep-attribution exists — revisit
-- these write policies at that build.
ALTER TABLE customer_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their business locations"
  ON customer_locations FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin/accounts add locations"
  ON customer_locations FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
    AND (has_role('admin') OR has_role('accounts'))
  );

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
