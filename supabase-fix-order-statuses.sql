-- Fix order status values from bulk upload (case-sensitive mismatch)
-- Maps non-standard status strings to the canonical lowercase/hyphenated values
-- Expected values: 'new', 'in-process', 'ready', 'completed', 'cancelled'

UPDATE orders SET status = 'completed'  WHERE status IN ('Complete', 'Completed', 'complete');
UPDATE orders SET status = 'new'        WHERE status IN ('New', 'NEW', 'pending', 'Pending');
UPDATE orders SET status = 'ready'      WHERE status IN ('Ready for Dispatch', 'Ready', 'ready for dispatch');
UPDATE orders SET status = 'in-process' WHERE status IN ('In Progress', 'In progress', 'in progress', 'In-Process');
UPDATE orders SET status = 'cancelled'  WHERE status IN ('Cancelled', 'Canceled', 'canceled', 'CANCELLED');

-- Verify: count orders by status after the fix
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status;
