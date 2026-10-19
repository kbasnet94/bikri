-- supabase-ledger-entry-delete.sql
-- Manual ledger entry delete: permanent deletion record + one atomic RPC.
-- Spec: docs/superpowers/specs/2026-10-19-manual-ledger-delete-design.md
-- Idempotent; run in the Supabase SQL editor.

-- 1. Permanent record of every deletion. Written only by the RPC below.
CREATE TABLE IF NOT EXISTS public.ledger_entry_deletions (
  id               BIGSERIAL PRIMARY KEY,
  business_id      UUID        NOT NULL,
  ledger_entry_id  BIGINT      NOT NULL,
  customer_id      BIGINT      NOT NULL,
  entry_type       TEXT        NOT NULL,
  amount           INTEGER     NOT NULL,   -- cents, as stored on the deleted row
  description      TEXT,
  entry_date       TIMESTAMPTZ NOT NULL,
  entry_created_at TIMESTAMPTZ NOT NULL,
  balance_delta    INTEGER     NOT NULL,   -- change applied to customers.current_balance by the delete
  reason           TEXT,
  deleted_by       UUID        NOT NULL DEFAULT auth.uid(),
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entry_deletions_business
  ON public.ledger_entry_deletions (business_id, deleted_at DESC);

ALTER TABLE public.ledger_entry_deletions ENABLE ROW LEVEL SECURITY;

-- Admins of the business may read. No insert/update/delete policies for
-- authenticated: rows are written only inside the SECURITY DEFINER function.
DROP POLICY IF EXISTS ledger_entry_deletions_admin_select ON public.ledger_entry_deletions;
CREATE POLICY ledger_entry_deletions_admin_select ON public.ledger_entry_deletions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.user_id = auth.uid()
        AND bu.business_id = ledger_entry_deletions.business_id
        AND bu.active
        AND 'admin' = ANY (bu.roles)
    )
  );

-- 2. Close the side door: manual rows (order_id IS NULL) can no longer be
-- deleted directly through the API by anyone; only order-linked rows may be
-- (the edit-order / payment-status / delete-order flows need that, and they
-- always filter by order_id). Manual deletes go through the RPC below.
-- Replaces the policy from supabase-roles-rls.sql.
DROP POLICY IF EXISTS ledger_manual_delete_accounts ON public.ledger_entries;
CREATE POLICY ledger_manual_delete_accounts ON public.ledger_entries
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (order_id IS NOT NULL);

-- 3. The only door for manual rows: delete, record it, fix the balance. One transaction.
CREATE OR REPLACE FUNCTION public.delete_manual_ledger_entry(
  p_entry_id BIGINT,
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry        ledger_entries%ROWTYPE;
  v_delta        INTEGER;
  v_new_balance  INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed to delete ledger entries for this business' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entry
  FROM ledger_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be an active admin/accounts member of THIS entry's business.
  -- (has_role() is not business-scoped, so check membership directly.)
  IF NOT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = v_entry.business_id
      AND bu.active
      AND bu.roles && ARRAY['admin','accounts']::text[]
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete ledger entries for this business' USING ERRCODE = '42501';
  END IF;

  IF v_entry.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order-linked ledger entries cannot be deleted; change the order instead' USING ERRCODE = 'P0001';
  END IF;

  -- Exact inverse of the client's ledgerBalanceDelta():
  -- credit/payment decreased the balance, so deleting puts the amount back.
  v_delta := -(CASE WHEN v_entry.type IN ('credit','payment') THEN -v_entry.amount ELSE v_entry.amount END);

  INSERT INTO ledger_entry_deletions (
    business_id, ledger_entry_id, customer_id, entry_type, amount, description,
    entry_date, entry_created_at, balance_delta, reason, deleted_by
  ) VALUES (
    v_entry.business_id, v_entry.id, v_entry.customer_id, v_entry.type, v_entry.amount, v_entry.description,
    v_entry.entry_date, v_entry.created_at, v_delta, NULLIF(BTRIM(p_reason), ''), auth.uid()
  );

  DELETE FROM ledger_entries WHERE id = p_entry_id;

  UPDATE customers
  SET current_balance = current_balance + v_delta
  WHERE id = v_entry.customer_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'customer_id',   v_entry.customer_id,
    'balance_delta', v_delta,
    'new_balance',   v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_manual_ledger_entry(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_manual_ledger_entry(BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_manual_ledger_entry(BIGINT, TEXT) TO authenticated;
