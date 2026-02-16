-- Fix stock_quantity on products and product_variants
-- by recalculating from the sum of all inventory_movements.
-- This corrects the bulk upload bug where each order overwrote
-- the previous stock update instead of decrementing cumulatively.

-- 1. Fix non-variant products
UPDATE products p
SET stock_quantity = COALESCE(
  (SELECT SUM(im.quantity_change)
   FROM inventory_movements im
   WHERE im.product_id = p.id
     AND im.variant_id IS NULL),
  0
);

-- 2. Fix product variants
UPDATE product_variants pv
SET stock_quantity = COALESCE(
  (SELECT SUM(im.quantity_change)
   FROM inventory_movements im
   WHERE im.variant_id = pv.id),
  0
);

-- 3. Verify: show products with their recalculated stock
SELECT p.id, p.name, p.stock_quantity, p.has_variants
FROM products p
ORDER BY p.stock_quantity ASC
LIMIT 30;

-- 4. Verify: show variants with their recalculated stock
SELECT pv.id, pv.name, pv.sku, pv.stock_quantity, p.name AS product_name
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
ORDER BY pv.stock_quantity ASC
LIMIT 30;
