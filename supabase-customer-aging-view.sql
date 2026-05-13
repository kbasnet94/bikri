-- Customer A/R aging view.
-- Buckets unpaid obligations (purchase / debit / adjustment ledger entries)
-- by age in days from the obligation date, using FIFO matching of credit
-- entries (payments) against oldest obligations first.
--
-- Cancelled-order entries are excluded on both sides (obligations AND credits).
-- This matches the convention in client/src/hooks/use-orders.ts cancellation handling.
--
-- All amounts are in cents (matches the rest of the schema).
--
-- This view is read-only and additive. It does not modify any table.
-- Drop with: DROP VIEW IF EXISTS customer_aging;

CREATE OR REPLACE VIEW customer_aging
WITH (security_invoker = on)
AS
WITH cancelled_orders AS (
  SELECT id FROM orders WHERE status = 'cancelled'
),
clean_entries AS (
  SELECT
    le.id,
    le.customer_id,
    le.business_id,
    le.type,
    le.amount,
    le.entry_date
  FROM ledger_entries le
  WHERE le.order_id IS NULL
     OR le.order_id NOT IN (SELECT id FROM cancelled_orders)
),
customer_credits AS (
  -- Total payments per customer (credit and payment entries both decrease balance).
  SELECT customer_id, COALESCE(SUM(amount), 0)::bigint AS total_credits
  FROM clean_entries
  WHERE type IN ('credit', 'payment')
  GROUP BY customer_id
),
obligations AS (
  -- All balance-increasing entries, oldest-first per customer,
  -- with a running cumulative sum to enable FIFO matching.
  SELECT
    e.customer_id,
    e.amount,
    e.entry_date,
    SUM(e.amount) OVER (
      PARTITION BY e.customer_id
      ORDER BY e.entry_date ASC, e.id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::bigint AS cumulative_amount
  FROM clean_entries e
  WHERE e.type IN ('purchase', 'debit', 'adjustment')
),
unpaid AS (
  -- For each obligation, the portion not yet covered by total credits.
  --   cumulative_amount - total_credits  → how much of THIS obligation
  --   plus everything older is still unpaid (after credits eat from
  --   the bottom of the stack).
  -- Clamped to [0, amount].
  SELECT
    o.customer_id,
    o.entry_date,
    GREATEST(
      LEAST(
        o.amount,
        o.cumulative_amount - COALESCE(c.total_credits, 0)
      ),
      0
    )::bigint AS unpaid_amount
  FROM obligations o
  LEFT JOIN customer_credits c ON c.customer_id = o.customer_id
),
aged AS (
  SELECT
    customer_id,
    unpaid_amount,
    (CURRENT_DATE - entry_date::date)::int AS age_days
  FROM unpaid
  WHERE unpaid_amount > 0
),
aggregated AS (
  SELECT
    customer_id,
    SUM(CASE WHEN age_days <= 30                       THEN unpaid_amount ELSE 0 END)::bigint AS bucket_0_30,
    SUM(CASE WHEN age_days >  30 AND age_days <= 60    THEN unpaid_amount ELSE 0 END)::bigint AS bucket_31_60,
    SUM(CASE WHEN age_days >  60 AND age_days <= 90    THEN unpaid_amount ELSE 0 END)::bigint AS bucket_61_90,
    SUM(CASE WHEN age_days >  90                       THEN unpaid_amount ELSE 0 END)::bigint AS bucket_90_plus,
    SUM(unpaid_amount)::bigint                                                              AS total_unpaid
  FROM aged
  GROUP BY customer_id
)
SELECT
  c.id,
  c.business_id,
  COALESCE(a.bucket_0_30,    0)::bigint AS bucket_0_30,
  COALESCE(a.bucket_31_60,   0)::bigint AS bucket_31_60,
  COALESCE(a.bucket_61_90,   0)::bigint AS bucket_61_90,
  COALESCE(a.bucket_90_plus, 0)::bigint AS bucket_90_plus,
  COALESCE(a.total_unpaid,   0)::bigint AS total_unpaid
FROM customers c
LEFT JOIN aggregated a ON a.customer_id = c.id;

COMMENT ON VIEW customer_aging IS
  'Read-only A/R aging buckets per customer in cents. FIFO-matched, excludes cancelled-order entries. SECURITY INVOKER — inherits RLS from customers/ledger_entries.';
