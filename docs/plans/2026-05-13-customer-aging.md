# Customer A/R Aging Buckets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four A/R aging-bucket columns (0–30 / 31–60 / 61–90 / 90+ days) to the customers page so Karan can see how old each customer's outstanding balance is, computed via FIFO matching of credits against purchase-date obligations.

**Architecture:** All aging logic lives in a single Postgres view `customer_aging` that does FIFO matching in pure SQL via a window-function cumulative sum (no per-customer PL/pgSQL loop). The frontend fetches from the view via a new `useCustomersWithAging` hook that replaces `useCustomers` on the customers page. The existing `current_balance` column is preserved unchanged — the view is purely additive and read-only. Credit Limit column is removed from the UI to free horizontal space; the underlying column stays in the DB.

**Tech Stack:** Postgres 15+ (Supabase), supabase-js, React 18, TanStack Query v5, Tailwind, shadcn/Radix table primitives.

**Workspace:** Branch `feat/customer-aging` off `main`. Vercel auto-deploys branches to preview URLs.

**Out of scope:**
- Fixing `current_balance` drift (separate task)
- Edit-customer UI (separate task)
- Aging on the per-customer detail dialog (can come later)
- Materialized view / refresh cron (only if performance demands it)
- Test framework setup (project has none; verification is SQL spot-check + browser preview)

---

## File Structure

**Created:**
- `supabase-customer-aging-view.sql` — the migration (single file, root of repo, matches the existing `supabase-*.sql` naming convention)
- `docs/plans/2026-05-13-customer-aging.md` — this plan

**Modified:**
- `client/src/hooks/use-customers.ts` — add `CustomerWithAging` type, add `useCustomersWithAging(search?)` hook
- `client/src/pages/customers.tsx` — swap `useCustomers` → `useCustomersWithAging`, remove Credit Limit column header + cell, add four bucket column headers + cells, bump `colSpan` from 5 to 8

**Not touched:**
- `shared/schema.ts` (Drizzle schema is vestigial per memory; the view isn't a table)
- Any existing `supabase-rls-*.sql` file
- Any data — no INSERT/UPDATE/DELETE
- `useCustomers`, `useCustomerStats`, `useCustomer`, `useCustomerLedger`, `useCreateCustomer`, `useCreateLedgerEntry`, `useCustomerTypeMap` (all still used elsewhere)

---

## Task 1: Write the FIFO aging view migration

**Files:**
- Create: `supabase-customer-aging-view.sql`

- [ ] **Step 1: Write the view SQL**

Create `supabase-customer-aging-view.sql` with this content:

```sql
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
  -- Total payments per customer (credit entries decrease balance).
  SELECT customer_id, COALESCE(SUM(amount), 0)::bigint AS total_credits
  FROM clean_entries
  WHERE type = 'credit'
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
    EXTRACT(EPOCH FROM (NOW() - entry_date)) / 86400 AS age_days
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
```

- [ ] **Step 2: Commit the migration file alone (no DB changes yet)**

```bash
git checkout -b feat/customer-aging
git add supabase-customer-aging-view.sql docs/plans/2026-05-13-customer-aging.md
git commit -m "feat(customers): add A/R aging view migration

Read-only view that FIFO-matches credits against oldest obligations
and buckets unpaid amounts into 0-30/31-60/61-90/90+ day windows.
Excludes entries on cancelled orders. SECURITY INVOKER so RLS on
underlying tables applies. Not yet applied to the DB."
```

---

## Task 2: Apply the view to the live Supabase DB and verify

**Files:** No code changes — verification against the live DB.

- [ ] **Step 1: Apply the view via Supabase SQL Editor**

Open Supabase Dashboard → project `zezmnkdinddjqnpfnaoq` → SQL Editor → New query.

Paste the entire contents of `supabase-customer-aging-view.sql` and click Run.

Expected: `Success. No rows returned.`

If error, do NOT proceed. Read the error, fix the SQL, re-commit, and retry.

- [ ] **Step 2: Smoke-test the view returns rows scoped to the business**

In the SQL Editor, run as the demo user context (use the Authentication → Users section to impersonate, or test the view via the JS client). Initial sanity check as service role:

```sql
SELECT COUNT(*) FROM customer_aging
WHERE business_id = '136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c';
```

Expected: count matches `SELECT COUNT(*) FROM customers WHERE business_id = '136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c'` (every customer gets a row, even with all-zero buckets).

- [ ] **Step 3: Top-debtor sanity check**

```sql
SELECT
  c.name,
  c.current_balance / 100.0 AS cached_balance_npr,
  ca.total_unpaid / 100.0   AS aging_total_npr,
  ca.bucket_0_30 / 100.0    AS bucket_0_30_npr,
  ca.bucket_31_60 / 100.0   AS bucket_31_60_npr,
  ca.bucket_61_90 / 100.0   AS bucket_61_90_npr,
  ca.bucket_90_plus / 100.0 AS bucket_90_plus_npr
FROM customers c
JOIN customer_aging ca ON ca.id = c.id
WHERE c.business_id = '136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c'
ORDER BY ca.total_unpaid DESC
LIMIT 10;
```

Expected:
- All four buckets sum to `total_unpaid` (within rounding cents).
- `total_unpaid` is close to but may not exactly equal `cached_balance_npr` — drift up to ~0.16% lifetime is expected per the known `current_balance` drift issue.
- No NULLs in bucket columns.
- No negative numbers in any bucket.

**STOP HERE FOR KARAN'S REVIEW.** Paste the top-10 results back and have Karan confirm 3–4 of the names look right vs. his mental model. If the numbers look off (large drift, negative buckets, missing customers), debug before proceeding.

- [ ] **Step 4: Verify RLS by querying as the demo user via JS client**

In a browser DevTools console with the app loaded and demo user logged in:

```js
const { data, error } = await window.__supabase
  .from('customer_aging')
  .select('id, total_unpaid')
  .limit(5);
console.log({ data, error });
```

(If `window.__supabase` isn't exposed, use `supabase` from any imported module.)

Expected: 5 rows returned, no error, all rows belong to the demo user's business (cross-check `business_id`).

- [ ] **Step 5: Commit a note recording verification**

No code change — just an annotation in case we revisit:

```bash
git commit --allow-empty -m "chore(customers): verified customer_aging view against live DB

- Top-10 debtor buckets match expected within rounding
- RLS scopes view rows correctly for demo user
- Total unpaid reconciles to cached current_balance within drift tolerance"
```

---

## Task 3: Add the `useCustomersWithAging` hook

**Files:**
- Modify: `client/src/hooks/use-customers.ts`

- [ ] **Step 1: Add the `CustomerAging` and `CustomerWithAging` types**

Open `client/src/hooks/use-customers.ts`. After the existing `Customer` interface (around line 18), add:

```ts
export interface CustomerAging {
  id: number;
  business_id: string;
  bucket_0_30: number;     // cents
  bucket_31_60: number;    // cents
  bucket_61_90: number;    // cents
  bucket_90_plus: number;  // cents
  total_unpaid: number;    // cents
}

export interface CustomerWithAging extends Customer {
  aging: {
    bucket_0_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_90_plus: number;
    total_unpaid: number;
  };
}
```

- [ ] **Step 2: Add the `useCustomersWithAging` hook**

Below the existing `useCustomers` function (right after its closing brace, around line 58), add:

```ts
export function useCustomersWithAging(search?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['customers-with-aging', user?.businessId, search],
    queryFn: async () => {
      // Fetch customers and aging buckets in parallel. We join client-side
      // by id rather than via a Supabase nested-select because customer_aging
      // is a view (no FK), and joining server-side would require extra config.
      let customersQuery = supabase
        .from('customers')
        .select('*, customer_type:customer_types(id, name)');

      if (search) {
        customersQuery = customersQuery.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }

      const [customersRes, agingRes] = await Promise.all([
        customersQuery
          .order('current_balance', { ascending: false })
          .order('name', { ascending: true })
          .limit(10000),
        supabase
          .from('customer_aging')
          .select('id, bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus, total_unpaid')
          .limit(10000),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (agingRes.error) throw agingRes.error;

      const agingById = new Map<number, CustomerAging>();
      for (const row of (agingRes.data || []) as CustomerAging[]) {
        agingById.set(row.id, row);
      }

      return (customersRes.data || []).map((c: Customer) => {
        const a = agingById.get(c.id);
        return {
          ...c,
          aging: {
            bucket_0_30: a?.bucket_0_30 ?? 0,
            bucket_31_60: a?.bucket_31_60 ?? 0,
            bucket_61_90: a?.bucket_61_90 ?? 0,
            bucket_90_plus: a?.bucket_90_plus ?? 0,
            total_unpaid: a?.total_unpaid ?? 0,
          },
        } as CustomerWithAging;
      });
    },
    enabled: !!user?.businessId,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: No new errors. (Existing errors in unrelated files are not introduced by this change — diff before/after counts if needed.)

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/use-customers.ts
git commit -m "feat(customers): add useCustomersWithAging hook

Fetches customers and the customer_aging view in parallel and merges
on client. Read-only; does not change useCustomers."
```

---

## Task 4: Wire the new columns into the customers table

**Files:**
- Modify: `client/src/pages/customers.tsx`

- [ ] **Step 1: Swap the hook import**

At [client/src/pages/customers.tsx:2](client/src/pages/customers.tsx#L2), change:

```ts
import { useCustomers, useCustomer, useCreateCustomer, useCreateLedgerEntry, useCustomerLedger } from "@/hooks/use-customers";
```

to:

```ts
import { useCustomersWithAging, useCustomer, useCreateCustomer, useCreateLedgerEntry, useCustomerLedger } from "@/hooks/use-customers";
```

Then at line 55, change:

```ts
const { data: customers, isLoading } = useCustomers(search);
```

to:

```ts
const { data: customers, isLoading } = useCustomersWithAging(search);
```

- [ ] **Step 2: Replace Credit Limit header with four bucket headers**

In the `<TableHeader>` block at [client/src/pages/customers.tsx:92-100](client/src/pages/customers.tsx#L92-L100), replace:

```tsx
<TableRow className="bg-muted/30">
  <TableHead>Name</TableHead>
  <TableHead>Contact</TableHead>
  <TableHead className="text-right">Credit Limit</TableHead>
  <TableHead className="text-right">Balance</TableHead>
  <TableHead className="text-right">Actions</TableHead>
</TableRow>
```

with:

```tsx
<TableRow className="bg-muted/30">
  <TableHead>Name</TableHead>
  <TableHead>Contact</TableHead>
  <TableHead className="text-right">Balance</TableHead>
  <TableHead className="text-right whitespace-nowrap">0–30 d</TableHead>
  <TableHead className="text-right whitespace-nowrap">31–60 d</TableHead>
  <TableHead className="text-right whitespace-nowrap">61–90 d</TableHead>
  <TableHead className="text-right whitespace-nowrap">90+ d</TableHead>
  <TableHead className="text-right">Actions</TableHead>
</TableRow>
```

- [ ] **Step 3: Fix the empty-state `colSpan`**

In the same file at lines 102-109, the two loading/empty `<TableCell colSpan={5}>` cells need `colSpan={8}` now. Change both occurrences:

```tsx
<TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
```
→
```tsx
<TableCell colSpan={8} className="h-24 text-center">Loading...</TableCell>
```

And:

```tsx
<TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No customers found.</TableCell>
```
→
```tsx
<TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No customers found.</TableCell>
```

- [ ] **Step 4: Replace Credit Limit cell with four bucket cells**

In the row body at [client/src/pages/customers.tsx:135-145](client/src/pages/customers.tsx#L135-L145), replace:

```tsx
<TableCell className="text-right font-mono">{formatCurrencyShort(customer.credit_limit)}</TableCell>
<TableCell className="text-right">
  <span className={cn(
    "font-mono font-bold px-2 py-1 rounded-lg text-xs",
    customer.current_balance > 0
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
  )}>
    {formatCurrencyShort(customer.current_balance)}
  </span>
</TableCell>
```

with:

```tsx
<TableCell className="text-right">
  <span className={cn(
    "font-mono font-bold px-2 py-1 rounded-lg text-xs",
    customer.current_balance > 0
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
  )}>
    {formatCurrencyShort(customer.current_balance)}
  </span>
</TableCell>
<TableCell className="text-right font-mono text-xs text-muted-foreground">
  {customer.aging.bucket_0_30 > 0 ? formatCurrencyShort(customer.aging.bucket_0_30) : "—"}
</TableCell>
<TableCell className={cn(
  "text-right font-mono text-xs",
  customer.aging.bucket_31_60 > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
)}>
  {customer.aging.bucket_31_60 > 0 ? formatCurrencyShort(customer.aging.bucket_31_60) : "—"}
</TableCell>
<TableCell className={cn(
  "text-right font-mono text-xs",
  customer.aging.bucket_61_90 > 0 ? "text-orange-700 dark:text-orange-400" : "text-muted-foreground"
)}>
  {customer.aging.bucket_61_90 > 0 ? formatCurrencyShort(customer.aging.bucket_61_90) : "—"}
</TableCell>
<TableCell className={cn(
  "text-right font-mono text-xs font-semibold",
  customer.aging.bucket_90_plus > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
)}>
  {customer.aging.bucket_90_plus > 0 ? formatCurrencyShort(customer.aging.bucket_90_plus) : "—"}
</TableCell>
```

Design rationale (matches existing customers page conventions):
- `font-mono` aligns digit widths so the numbers line up vertically.
- `text-xs` keeps a dense 8-column row readable on a laptop screen.
- Zero buckets render as an em-dash in muted color — less visual noise than `NPR 0`.
- Color severity progresses with age: 0–30 muted (current, expected), 31–60 amber, 61–90 orange, 90+ bold red — same red family as the existing Balance pill so the eye groups them.
- No background pill on bucket cells (unlike Balance) — they're already inside a row, more pills would create visual clutter.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: No new TypeScript errors.

- [ ] **Step 6: Run the dev server and visually verify**

Run: `npm run dev`

In the browser at http://localhost:5173 (or whatever Vite port):
1. Log in as `demo@bikri.com` / `demo123`.
2. Navigate to the Customers page.
3. Confirm: 8 columns visible (Name, Contact, Balance, 0–30 d, 31–60 d, 61–90 d, 90+ d, Actions).
4. Confirm: Credit Limit column is gone.
5. Confirm: at least one customer with old debt shows non-zero values in 31–60, 61–90, or 90+ columns with the expected color severity.
6. Confirm: customers with no debt show em-dashes across all buckets and a green Balance.
7. Confirm: search still narrows the customer list.
8. Confirm: clicking "Details" still opens the customer dialog without errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/customers.tsx
git commit -m "feat(customers): replace Credit Limit with 0/30/60/90 aging columns

Removes Credit Limit column from customers table and adds four
A/R aging bucket columns (0-30, 31-60, 61-90, 90+ days) sourced
from useCustomersWithAging. Color severity scales with age."
```

---

## Task 5: Vercel preview and merge

**Files:** None — deployment verification.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/customer-aging
```

Vercel will auto-build a preview deployment. Wait for the green check (~2–3 minutes).

- [ ] **Step 2: Verify on the Vercel preview URL**

Open the preview URL Vercel posts (also visible in the GitHub PR if one is open, or in the Vercel dashboard).

Log in with the demo creds and repeat the visual checks from Task 4 Step 6. Specifically confirm production data renders correctly — not just local dev data.

- [ ] **Step 3: Karan signs off on the preview**

**STOP HERE for Karan's go/no-go before merging.** Numbers must match his expectations; UI must look right.

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git pull
git merge feat/customer-aging --no-ff -m "Merge feat/customer-aging: A/R aging buckets on customers page"
git push origin main
```

Vercel auto-deploys `main` to production. Wait for green check, then verify on the production URL one more time.

- [ ] **Step 5: Delete the feature branch**

```bash
git branch -d feat/customer-aging
git push origin --delete feat/customer-aging
```

---

## Rollback

If anything goes wrong post-merge:

- **UI bug only:** `git revert <merge-commit>` + push. Vercel redeploys in ~60s. View stays in DB (harmless).
- **View bug:** In Supabase SQL Editor, run `DROP VIEW IF EXISTS customer_aging;`. UI will then error on the customer_aging fetch — also revert the merge commit. Or temporarily restore `useCustomers` in `customers.tsx` and redeploy.
- **Both:** Revert merge + drop view.

The view holds no data — dropping it is instant and lossless.

---

## Open follow-ups (not part of this plan)

- Add a totals footer row to the customers table summing each bucket.
- Add aging buckets to the customer detail dialog ledger view.
- CSV export of the aging report.
- Reconcile `current_balance` drift in a separate migration.
- Decide if the Excel script at `Desktop/Assistant/scripts/bikri_payment_ledger.py` should switch from FIFO-in-Python to `SELECT * FROM customer_aging` for consistency.
