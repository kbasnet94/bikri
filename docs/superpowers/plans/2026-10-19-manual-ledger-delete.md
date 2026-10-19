# Manual Ledger Entry Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin/accounts users delete a hand-entered ledger line from the customer ledger dialog, atomically reversing its balance effect and recording the deletion permanently.

**Architecture:** One SECURITY DEFINER Postgres function does authorisation, the order-linked guard, the audit insert, the row delete and the balance update in a single transaction. The client only calls that RPC through a TanStack mutation and renders an X + confirm dialog on deletable rows. Pure helpers for "deletable?" and the balance delta live in `lib/` with vitest.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Vite + React 18, TanStack Query, shadcn `AlertDialog`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-manual-ledger-delete-design.md`

## Global Constraints

- Money is integer cents; sign convention from `client/src/lib/ledger-math.ts` (`ledgerBalanceDelta`).
- Deletable ⇔ `order_id IS NULL`. Enforced in the RPC, mirrored in the UI.
- Caller must hold `admin` or `accounts` for the entry's own `business_id` (not merely any business).
- `npm run check` must stay at 10 errors; `npx vitest run` must stay green (60 → more).
- Do not push `main`; the branch is `feat/ledger-entry-delete`. SQL is applied by Karan before merge.

## Review Focus

1. A delete attempted on an order-linked entry via direct RPC call must fail with the spec's message and change nothing (Task 1 live test).
2. An `accounts`/`admin` user of business A must not be able to delete an entry of business B (Task 1 step 5: demo-tenant admin against a Prime Nutrition entry).
3. Full Viewer sees the X disabled, never hidden, with the read-only tooltip (Task 4, manual check).
4. A failed RPC (network drop mid-call) leaves ledger, deletions table and balance consistent — guaranteed by single-function transaction; Task 1 step verifying the function is one body with no COMMIT.
5. After delete, the dashboard Outstanding Credit and aging totals refresh without reload (Task 3 invalidation keys; Task 4 manual check).

---

### Task 1: Database — deletions table + `delete_manual_ledger_entry` RPC

**Files:**
- Create: `supabase-ledger-entry-delete.sql`
- Test: live, against production project via service-role REST (read-only except on a throwaway entry on the `Bikri Mobile Demo` business `6965b7d2-4bfb-4b8b-9ef7-a15f44a5df0b`)

**Interfaces:**
- Produces: RPC `delete_manual_ledger_entry(p_entry_id bigint, p_reason text default null) returns jsonb` → `{customer_id:int, balance_delta:int, new_balance:int}`; table `ledger_entry_deletions`.

- [ ] **Step 1: Write the SQL file** exactly per spec §Decisions 1–2. Idempotent: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`. Add `CREATE INDEX IF NOT EXISTS idx_ledger_entry_deletions_business ON ledger_entry_deletions(business_id, deleted_at DESC)`.

- [ ] **Step 2: Apply to the production project.** Karan runs the file in the Supabase SQL editor (the auto-mode classifier blocks CLI pushes; ask him). Expected: no errors.

- [ ] **Step 3: Live test — order-linked guard.** With the service-role key (bypasses RLS but not function logic; `auth.uid()` is NULL so authorisation must fail first). Call `POST /rest/v1/rpc/delete_manual_ledger_entry` with `{"p_entry_id": <id of any order-linked entry>}`. Expected: HTTP 4xx with message `Not allowed to delete ledger entries for this business` (auth check precedes the order guard; both are failures, which is the point: service role cannot delete through this door).

- [ ] **Step 4: Live test — happy path as a real user.** Sign in via `POST /auth/v1/token?grant_type=password` as `demo.admin@bikri.test` (password in Bikri worktree `.worktrees/codex-pwa-mobile/.env.local`, never printed). Insert a throwaway manual `credit` of 12,300 (1,230,000 cents) on a demo-tenant customer via REST as that user; note the customer's balance B. Call the RPC with that entry id and `p_reason: "plan task 1 test"`. Expected: `{customer_id, balance_delta: 1230000, new_balance: B + 1230000}`; ledger row gone; one row in `ledger_entry_deletions` with `amount = 1230000`, `balance_delta = 1230000`, `deleted_by = <demo admin uid>`.

- [ ] **Step 5: Live test — cross-business denial.** As `demo.admin@bikri.test`, call the RPC with the id of a manual entry belonging to Prime Nutrition (e.g. LE#7725). Expected: error `Not allowed to delete ledger entries for this business`; LE#7725 still present.

- [ ] **Step 6: Live test — order-linked denial as authorised user.** As `demo.admin@bikri.test`, call the RPC with a demo-tenant order-linked entry id. Expected: error `Order-linked ledger entries cannot be deleted; change the order instead`; row still present.

- [ ] **Step 7: Commit**

```bash
git add supabase-ledger-entry-delete.sql
git commit -m "feat(db): ledger_entry_deletions table + delete_manual_ledger_entry RPC"
```

### Task 2: Pure helpers `lib/ledger-delete.ts`

**Files:**
- Create: `client/src/lib/ledger-delete.ts`
- Test: `client/src/lib/ledger-delete.test.ts`

**Interfaces:**
- Consumes: `ledgerBalanceDelta(type: string, amount: number): number` from `./ledger-math`.
- Produces: `isDeletableLedgerEntry(entry: { order_id: number | null }): boolean`; `deletionBalanceDelta(type: string, amount: number): number`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { isDeletableLedgerEntry, deletionBalanceDelta } from './ledger-delete';

describe('isDeletableLedgerEntry', () => {
  it('manual entries (no order) are deletable', () => {
    expect(isDeletableLedgerEntry({ order_id: null })).toBe(true);
  });
  it('order-linked entries are not', () => {
    expect(isDeletableLedgerEntry({ order_id: 3474 })).toBe(false);
    expect(isDeletableLedgerEntry({ order_id: 0 })).toBe(false);
  });
});

describe('deletionBalanceDelta', () => {
  it('deleting a credit/payment puts the amount back on the balance', () => {
    expect(deletionBalanceDelta('credit', 1704000)).toBe(1704000);   // Kopila case
    expect(deletionBalanceDelta('payment', 500)).toBe(500);
  });
  it('deleting a purchase/debit/adjustment removes it from the balance', () => {
    expect(deletionBalanceDelta('purchase', 1000)).toBe(-1000);
    expect(deletionBalanceDelta('debit', 1000)).toBe(-1000);
    expect(deletionBalanceDelta('adjustment', -2)).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run client/src/lib/ledger-delete.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** both functions in `client/src/lib/ledger-delete.ts` (two one-liners; `order_id === null` only).
- [ ] **Step 4: Run.** Same command → 4 tests PASS.
- [ ] **Step 5: Commit** `feat: ledger-delete helpers (deletable check + inverse balance delta)`.

### Task 3: `useDeleteLedgerEntry` mutation

**Files:**
- Modify: `client/src/hooks/use-customers.ts` (add after `useCreateLedgerEntry`, ~line 508)

**Interfaces:**
- Consumes: RPC from Task 1.
- Produces:
  ```ts
  export interface DeleteLedgerEntryResult { customer_id: number; balance_delta: number; new_balance: number }
  export function useDeleteLedgerEntry(): UseMutationResult<DeleteLedgerEntryResult, Error, { entryId: number; customerId: number; reason?: string }>
  ```

- [ ] **Step 1: Implement.** `mutationFn` calls `supabase.rpc('delete_manual_ledger_entry', { p_entry_id: entryId, p_reason: reason?.trim() || null })`; throw `error` if set; return `data as DeleteLedgerEntryResult`. `onSuccess(_, vars)` invalidates, in order: `['ledger', vars.customerId]`, `['customers']`, `['customer-stats']`, `['dashboard']`.
- [ ] **Step 2: Typecheck.** `npx tsc --noEmit 2>&1 | Select-String "error TS" | Measure-Object` → Count 10.
- [ ] **Step 3: Commit** `feat: useDeleteLedgerEntry mutation over delete_manual_ledger_entry RPC`.

### Task 4: Ledger dialog UI — X column + confirm dialog

**Files:**
- Modify: `client/src/pages/customers.tsx` — imports (lines 1–55), `CustomerDetailsDialog` state (~line 715–740), ledger table header (~line 1171–1175), ledger rows (~line 1195–1207).

**Interfaces:**
- Consumes: `useDeleteLedgerEntry` (Task 3), `isDeletableLedgerEntry`, `deletionBalanceDelta` (Task 2), `AlertDialog*` from `@/components/ui/alert-dialog`, `X` from `lucide-react`, existing `canEditLedger`, `canWrite`, `READ_ONLY_HINT`, `READ_ONLY_CLASS`, `formatCurrency`, `toast`.

- [ ] **Step 1: Imports.** Add `X` to the lucide import; import `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle` from `@/components/ui/alert-dialog`; import `useDeleteLedgerEntry` alongside the other hooks; import `isDeletableLedgerEntry, deletionBalanceDelta` from `@/lib/ledger-delete`.
- [ ] **Step 2: State.** In `CustomerDetailsDialog`: `const deleteLedgerEntry = useDeleteLedgerEntry();`, `const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);`, `const [deleteReason, setDeleteReason] = useState("");`. Import the `LedgerEntry` type from `@/hooks/use-customers`.
- [ ] **Step 3: Header.** After the Amount `TableHead`, add `{canEditLedger && <TableHead className="w-10" />}`.
- [ ] **Step 4: Rows.** After the amount cell add, when `canEditLedger`, a `TableCell className="p-1 text-right"`: if `isDeletableLedgerEntry(entry)` render `<Button variant="ghost" size="icon" className={cn("h-7 w-7", READ_ONLY_CLASS)} disabled={!canWrite} title={canWrite ? "Delete entry" : READ_ONLY_HINT} aria-label="Delete entry" data-testid={`button-delete-ledger-${entry.id}`} onClick={() => { setDeleteReason(""); setEntryToDelete(entry); }}><X className="h-3.5 w-3.5" /></Button>`; else render nothing inside the cell.
- [ ] **Step 5: Dialog.** Render once, after the ledger `Table`: `<AlertDialog open={!!entryToDelete} onOpenChange={(o) => !o && setEntryToDelete(null)}>`. Content: title "Delete this ledger entry?"; description block listing `format(new Date(entry.entry_date), 'MMM dd, yyyy')`, capitalised `entry.type`, `formatCurrency(entry.amount)`, `entry.description || '-'`; a paragraph "This cannot be undone."; a paragraph `Balance will change by {delta >= 0 ? '+' : '-'}{formatCurrency(Math.abs(delta))}` where `delta = deletionBalanceDelta(entry.type, entry.amount)`; an `Input` bound to `deleteReason` with placeholder "Reason (optional)" and `data-testid="input-delete-ledger-reason"`; footer with `AlertDialogCancel` "Cancel" and `AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteLedgerEntry.isPending} data-testid="button-confirm-delete-ledger"` labelled "Delete entry".
- [ ] **Step 6: Confirm handler.** `onClick` of the action (call `e.preventDefault()` so the dialog stays open while pending): `await deleteLedgerEntry.mutateAsync({ entryId: entry.id, customerId: customer.id, reason: deleteReason })`; on success `toast({ title: "Ledger entry deleted", description: `New balance: ${formatCurrency(result.new_balance)}` })` and `setEntryToDelete(null)`; on error `toast({ title: "Could not delete entry", description: error.message, variant: "destructive" })`.
- [ ] **Step 7: Verify.** `npx vitest run` → all green (64). `npx tsc --noEmit` → 10 errors. `npx vite build` → built.
- [ ] **Step 8: Commit** `feat: delete manual ledger entries from the customer ledger dialog`.

### Task 5: Hand-over

- [ ] **Step 1:** Push `feat/ledger-entry-delete` to origin (not main).
- [ ] **Step 2:** Karan: run the SQL (if not already in Task 1), then the manual verification list in the spec on localhost:5000.
- [ ] **Step 3:** On Karan's go: `git checkout main && git merge --no-ff feat/ledger-entry-delete && git push origin main`; confirm Vercel production READY; delete the branch.
