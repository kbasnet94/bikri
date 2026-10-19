# Manual ledger entry delete — design

Date: 2026-10-19. Approved by Karan in chat (round one of a two-round effort; round two is a general admin-visible activity log for order/customer creation, built on the deletions table introduced here).

## Intent

Staff sometimes type a manual payment wrongly (2026-10-18: Kopila cheque entered as 17,040 instead of 170,040). Today the only fix is a service-role SQL edit by Karan. Accounts/admin users need to remove a wrong manual line themselves, safely, with a permanent trace.

Delete, not edit: editing an amount means re-deriving a balance delta and risks partial updates; delete + re-enter is one well-defined operation.

## Goals

- Admin and Accounts can delete a hand-entered ledger line from the customer ledger dialog.
- Deleting moves `customers.current_balance` by the exact opposite of the entry's effect, atomically with the row removal.
- Every deletion is recorded permanently (who, when, full row contents, optional reason).
- Ledger dialog, customer list, aging and dashboard KPIs reflect the change after the delete without a reload.

## Non-goals (this round)

- Editing an entry in place.
- Deleting order-linked entries (purchase lines, auto COD/Bank payments, cancellation reversals). Those are changed through the order (edit, payment-status change, cancel), which already re-syncs stock, ledger and balance.
- A UI to view the deletion record. Round two.
- Undo.

## Anti-goals

- A delete that removes the row but leaves the balance unchanged (or vice versa).
- A client-side path that can delete an order-linked entry.
- A deletion that leaves no trace.

## Constraints

- Supabase project `zezmnkdinddjqnpfnaoq`, Postgres + RLS. `main` auto-deploys to Vercel production; SQL is applied by Karan in the SQL editor before the merge is pushed.
- Money in cents (integer). Sign convention is `client/src/lib/ledger-math.ts` (`purchase`/`debit`/`adjustment` increase balance; `credit`/`payment` decrease).
- Existing RESTRICTIVE policies: manual (order_id IS NULL) ledger writes need `has_role('accounts')` (admin implied); Full Viewer has no write at all via `can_write()`.
- `has_role()` is NOT business-scoped (any active membership). The RPC must check membership for the entry's own business.
- tsc baseline is 10 pre-existing errors; gate on no new errors. vitest baseline 60 tests.

## Decisions

### Database (new file `supabase-ledger-entry-delete.sql`, run once in SQL editor)

1. Table `ledger_entry_deletions`:
   `id bigserial pk, business_id uuid not null, ledger_entry_id bigint not null, customer_id bigint not null, entry_type text not null, amount integer not null, description text, entry_date timestamptz not null, entry_created_at timestamptz not null, balance_delta integer not null` (the change applied to the customer balance, i.e. `-ledgerBalanceDelta`), `reason text, deleted_by uuid not null default auth.uid(), deleted_at timestamptz not null default now()`.
   RLS enabled. One SELECT policy: business admins only (`business_users` row for `auth.uid()` with `'admin' = ANY(roles)` and `active` for that `business_id`). No INSERT/UPDATE/DELETE policies for `authenticated` (writes happen only inside the SECURITY DEFINER function).
2. Function `delete_manual_ledger_entry(p_entry_id bigint, p_reason text default null) returns jsonb`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`:
   - Lock and load the entry (`SELECT ... FOR UPDATE`). Not found → `RAISE EXCEPTION 'Ledger entry not found'` (ERRCODE `P0002`).
   - Authorisation: caller must have an active `business_users` row for `entry.business_id` whose `roles` overlaps `{admin,accounts}`; else `RAISE EXCEPTION 'Not allowed to delete ledger entries for this business'` (ERRCODE `42501`).
   - Guard: `entry.order_id IS NOT NULL` → `RAISE EXCEPTION 'Order-linked ledger entries cannot be deleted; change the order instead'` (ERRCODE `P0001`).
   - Compute `v_delta := -(CASE WHEN entry.type IN ('credit','payment') THEN -entry.amount ELSE entry.amount END)` (the exact inverse of `ledgerBalanceDelta`).
   - `INSERT INTO ledger_entry_deletions (...)`, `DELETE FROM ledger_entries WHERE id = p_entry_id`, `UPDATE customers SET current_balance = current_balance + v_delta WHERE id = entry.customer_id RETURNING current_balance INTO v_new_balance`.
   - Return `jsonb_build_object('customer_id', entry.customer_id, 'balance_delta', v_delta, 'new_balance', v_new_balance)`.
   - `GRANT EXECUTE ... TO authenticated`.
   The function body is one transaction; any RAISE rolls everything back.

### Client

3. `client/src/lib/ledger-delete.ts` (pure, vitest-covered): `isDeletableLedgerEntry(entry: {order_id: number | null}): boolean` (true iff `order_id === null`) and `deletionBalanceDelta(type: string, amount: number): number` (`= -ledgerBalanceDelta(type, amount)`).
4. `useDeleteLedgerEntry()` in `client/src/hooks/use-customers.ts`: `useMutation` calling `supabase.rpc('delete_manual_ledger_entry', { p_entry_id, p_reason })`; on success invalidate `['ledger', customerId]`, `['customers']` (covers with-aging, aging-totals, type-map and `['customers', id]`), `['customer-stats']`, `['dashboard']`. Mutation input `{ entryId: number; customerId: number; reason?: string }`; returns the RPC's `{ customer_id, balance_delta, new_balance }`.
5. UI in `CustomerDetailsDialog` (`client/src/pages/customers.tsx`): a fifth, header-less ledger column rendered only when `canEditLedger`; each deletable row shows an icon button (`X` from lucide, `variant="ghost" size="icon"`, `data-testid="button-delete-ledger-{id}"`), disabled with `READ_ONLY_HINT`/`READ_ONLY_CLASS` when `!canWrite`. Order-linked rows render an empty cell. Clicking opens an `AlertDialog` (existing `@/components/ui/alert-dialog`): title "Delete this ledger entry?", a four-line summary (date, type, amount, description), the sentence "This cannot be undone.", a line "Balance will change by {signed formatCurrency(deletionBalanceDelta)}", an optional reason `Input` (placeholder "Reason (optional)"), Cancel, and a destructive "Delete entry" action. Success toast: "Ledger entry deleted" with description "New balance: {formatCurrency(new_balance)}". Error toast surfaces the RPC message.

## Left to the builder

- Exact Tailwind spacing of the new column and dialog body.
- Whether the reason input is `Input` or `Textarea` (either is fine; keep it single-line by default).

## Manual verification (Karan, localhost:5000 → production DB)

1. Run `supabase-ledger-entry-delete.sql` in the SQL editor.
2. As admin: open a customer with a manual credit; X visible on manual rows only; delete one test entry you create for the purpose; balance on the customer row, aging totals and dashboard Outstanding Credit all move by the amount; a row appears in `ledger_entry_deletions`.
3. As operations/sales test user: no X. As Full Viewer: X disabled with the read-only hint.
4. `npm run integrity-check` → 0 new findings.
