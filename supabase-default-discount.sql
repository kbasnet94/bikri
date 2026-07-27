-- supabase-default-discount.sql
-- Adds reference-only usual-discount column + one-time backfill from order history.
--
-- PREVIEW the backfill first (run this SELECT alone, eyeball results):
--   SELECT c.id, c.name, b.pct, b.n_items
--   FROM customers c
--   JOIN (
--     SELECT * FROM (
--       SELECT o.customer_id,
--              ROUND(oi.discount * 100.0 / oi.unit_price) AS pct,
--              COUNT(*) AS n_items,
--              MAX(o.created_at) AS last_seen,
--              ROW_NUMBER() OVER (PARTITION BY o.customer_id
--                                 ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC) AS rn
--       FROM order_items oi
--       JOIN orders o ON o.id = oi.order_id
--       WHERE o.status NOT IN ('cancelled','canceled')
--         AND oi.unit_price > 0
--         AND oi.discount > 0
--         AND ROUND(oi.discount * 100.0 / oi.unit_price) < 100
--       GROUP BY o.customer_id, ROUND(oi.discount * 100.0 / oi.unit_price)
--     ) t WHERE rn = 1
--   ) b ON b.customer_id = c.id
--   WHERE c.customer_type_id IN (3,4,7)
--      OR EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = c.id
--                 AND o2.payment_status = 'Credit' AND o2.status NOT IN ('cancelled','canceled'))
--   ORDER BY c.name;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS default_discount_pct numeric(5,2);

WITH modal AS (
  SELECT * FROM (
    SELECT o.customer_id,
           ROUND(oi.discount * 100.0 / oi.unit_price) AS pct,
           ROW_NUMBER() OVER (PARTITION BY o.customer_id
                              ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC) AS rn
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status NOT IN ('cancelled','canceled')
      AND oi.unit_price > 0
      AND oi.discount > 0
      AND ROUND(oi.discount * 100.0 / oi.unit_price) < 100
    GROUP BY o.customer_id, ROUND(oi.discount * 100.0 / oi.unit_price)
  ) t WHERE rn = 1
)
UPDATE customers c
SET default_discount_pct = m.pct
FROM modal m
WHERE m.customer_id = c.id
  AND c.default_discount_pct IS NULL
  AND (c.customer_type_id IN (3,4,7)
       OR EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = c.id
                  AND o2.payment_status = 'Credit' AND o2.status NOT IN ('cancelled','canceled')));
