-- Customer type vs channel untangling (spec: 2026-07-29-customer-type-channel-design.md)
-- Data-only migration. ORDER MATTERS: backfill orders.channel from the
-- legacy channel-ish types BEFORE moving customers off them.

-- 1) Backfill channel on historical orders (only where not already set).
UPDATE orders o
SET channel = CASE lower(ct.name)
  WHEN 'daraz' THEN 'daraz'
  WHEN 'instagram' THEN 'instagram'
  WHEN 'friends & family' THEN 'friends'
  WHEN 'event' THEN 'event'
END
FROM customers c
JOIN customer_types ct ON ct.id = c.customer_type_id
WHERE o.customer_id = c.id
  AND o.channel IS NULL
  AND lower(ct.name) IN ('daraz', 'instagram', 'friends & family', 'event');

-- 2) Consolidate: everyone typed Daraz / F&F / Event becomes Instagram-typed
--    (id 2), which is about to be renamed Consumer.
UPDATE customers c
SET customer_type_id = (SELECT id FROM customer_types WHERE lower(name) = 'instagram')
WHERE c.customer_type_id IN (
  SELECT id FROM customer_types WHERE lower(name) IN ('daraz', 'friends & family', 'event')
);

-- 3) Rename the surviving type.
UPDATE customer_types SET name = 'Consumer' WHERE lower(name) = 'instagram';

-- 4) Remove the now-empty legacy types.
DELETE FROM customer_types WHERE lower(name) IN ('daraz', 'friends & family', 'event');

-- 5) Sanity checks (run the SELECTs, expect: 0 rows on the first two).
-- SELECT count(*) FROM customers c JOIN customer_types ct ON ct.id=c.customer_type_id WHERE lower(ct.name) IN ('daraz','friends & family','event');
-- SELECT count(*) FROM customer_types WHERE lower(name) IN ('daraz','friends & family','event');
-- SELECT channel, count(*) FROM orders GROUP BY channel ORDER BY 2 DESC;
