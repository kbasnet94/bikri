# Default Client Discount Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each B2B customer carries a reference-only "usual discount %" — backfilled from order history, shown (never pre-filled) beside order discount inputs with click-to-copy, editable by accounts/admin.

**Architecture:** One additive column `customers.default_discount_pct` + a backfill in the same SQL file. A tiny pure helper (`usualDiscountLabel`) drives a hint rendered next to the three discount inputs in the new-order flow. Editing lives in the two existing customer dialogs, gated by the shipped `canAccess(roles,'ledger-edit')`.

**Tech Stack:** Vite + React 18 + TanStack Query + shadcn + Supabase. Tests: vitest (pure logic only — repo has no component-test infra; do not add any).

## Global Constraints

- Repo: `C:\Users\Karan2\Desktop\All Cursor Projects\Bikri 2.0`, work on branch `feat/default-discount-reference` off `main`.
- tsc baseline: 10 pre-existing errors in database.types.ts — gate on no NEW errors (`npm run check`); never bare `tsc` on files.
- `default_discount_pct` is a PERCENT (0–100, numeric(5,2)), NOT cents — never multiply by 100 on save (unlike creditLimit).
- The order discount inputs must NEVER be pre-populated from this field. Only an explicit user click copies the value.
- Role gate for editing: `canAccess(user?.roles ?? [], 'ledger-edit')` from `client/src/lib/roles.ts` (accounts/admin).
- SQL applied manually via Supabase Studio by Karan (repo convention: `.sql` file in root); customer type ids: Gym=3, Retail=4, Pharmacy=7; business is multi-tenant — backfill must NOT filter by business (rule applies to all businesses' customers uniformly).
- Existing pattern refs: `useUpdateCustomerType` in `client/src/hooks/use-customers.ts` (mutation shape), `canEditLedger` usage in `client/src/pages/customers.tsx` (~line 190).

---

### Task 1: Migration + backfill SQL

**Files:**
- Create: `supabase-default-discount.sql` (repo root)

**Interfaces:**
- Produces: `customers.default_discount_pct numeric(5,2) NULL` — later tasks read/write it via PostgREST as `default_discount_pct`.

- [ ] **Step 1: Write the SQL file**

```sql
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
--       WHERE o.status <> 'cancelled'
--         AND oi.unit_price > 0
--         AND oi.discount > 0
--         AND ROUND(oi.discount * 100.0 / oi.unit_price) < 100
--       GROUP BY o.customer_id, ROUND(oi.discount * 100.0 / oi.unit_price)
--     ) t WHERE rn = 1
--   ) b ON b.customer_id = c.id
--   WHERE c.customer_type_id IN (3,4,7)
--      OR EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = c.id
--                 AND o2.payment_status = 'Credit' AND o2.status <> 'cancelled')
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
    WHERE o.status <> 'cancelled'
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
                  AND o2.payment_status = 'Credit' AND o2.status <> 'cancelled'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase-default-discount.sql
git commit -m "feat: default_discount_pct column + history backfill SQL"
```

(Application in Studio is the controller/Karan's go-live step — preview SELECT first, then the migration.)

---

### Task 2: usualDiscountLabel helper (TDD)

**Files:**
- Create: `client/src/lib/usual-discount.ts`
- Test: `client/src/lib/usual-discount.test.ts`

**Interfaces:**
- Produces: `usualDiscountLabel(pct: number | null | undefined): string | null` — returns `null` for null/undefined/NaN/≤0/≥100, else `"Usual: N%"` with up to 2 decimals, trailing zeros trimmed. Task 3 renders its output and uses `pct` for click-to-copy.

- [ ] **Step 1: Write the failing test**

```ts
// client/src/lib/usual-discount.test.ts
import { describe, it, expect } from 'vitest';
import { usualDiscountLabel } from './usual-discount';

describe('usualDiscountLabel', () => {
  it('null/undefined/invalid → null', () => {
    expect(usualDiscountLabel(null)).toBeNull();
    expect(usualDiscountLabel(undefined)).toBeNull();
    expect(usualDiscountLabel(NaN)).toBeNull();
    expect(usualDiscountLabel(0)).toBeNull();
    expect(usualDiscountLabel(-5)).toBeNull();
    expect(usualDiscountLabel(100)).toBeNull();
  });
  it('formats whole numbers without decimals', () => {
    expect(usualDiscountLabel(12)).toBe('Usual: 12%');
  });
  it('keeps meaningful decimals, trims trailing zeros', () => {
    expect(usualDiscountLabel(12.5)).toBe('Usual: 12.5%');
    expect(usualDiscountLabel(12.5)).not.toContain('12.50');
  });
  it('accepts numeric strings from PostgREST', () => {
    expect(usualDiscountLabel('12.00' as unknown as number)).toBe('Usual: 12%');
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run client/src/lib/usual-discount.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// client/src/lib/usual-discount.ts
// PostgREST returns numeric columns as strings; accept both.
export function usualDiscountLabel(pct: number | string | null | undefined): string | null {
  const n = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (n == null || Number.isNaN(n) || n <= 0 || n >= 100) return null;
  const rounded = Math.round(n * 100) / 100;
  return `Usual: ${rounded}%`;
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run client/src/lib/usual-discount.test.ts` → PASS; `npm run check` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/usual-discount.ts client/src/lib/usual-discount.test.ts
git commit -m "feat: usualDiscountLabel helper"
```

---

### Task 3: Order-form hint with click-to-copy

**Files:**
- Modify: `client/src/pages/orders.tsx` (AddToCartControls/ProductRow discount input ~line 1223-1240; cart review discount inputs ~line 1805-1815; ProductRow call sites ~1725-1750)

**Interfaces:**
- Consumes: `usualDiscountLabel` (Task 2); `selectedCustomer` state (orders.tsx:1287) — after Task 1 the customer rows fetched by `useCustomers` include `default_discount_pct` automatically (`select('*')`).
- Produces: user-visible hint; no exported API.

- [ ] **Step 1: Thread the value into ProductRow** — the component containing the discount input around line 1233 (rendered from call sites ~1725-1750, inside the new-order dialog where `selectedCustomer` is in scope). Add a prop `usualDiscountPct?: number | null` to ProductRow (and pass through to its add-to-cart controls if they are separate components); pass `usualDiscountPct={selectedCustomer?.default_discount_pct ?? null}` at both call sites.

- [ ] **Step 2: Render the hint next to the ProductRow discount input** (beside the existing Discount % label/input around line 1233):

```tsx
{usualDiscountLabel(usualDiscountPct) && (
  <button
    type="button"
    className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
    title="Click to use this discount"
    onClick={() => setDiscountPercent(
      typeof usualDiscountPct === 'string' ? parseFloat(usualDiscountPct) : (usualDiscountPct as number)
    )}
    data-testid="usual-discount-hint"
  >
    {usualDiscountLabel(usualDiscountPct)}
  </button>
)}
```

(Import `usualDiscountLabel` at top of orders.tsx. `setDiscountPercent` is the existing state setter at ~line 1172.)

- [ ] **Step 3: Same hint on the cart review inputs** (~line 1811): render the same button beside each cart item's discount input, calling the existing `updateDiscountPercent(item.productId, <pct>, item.variantId)` on click. `selectedCustomer` is in scope here directly.

- [ ] **Step 4: Confirm NO pre-population** — grep your diff: `default_discount_pct` must never appear in any `useState` initializer, `value=`, cart-item construction, or `addToCart` call. The only writes are inside onClick handlers.

- [ ] **Step 5: Verify** — `npx vitest run` all green; `npm run check` no new errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/orders.tsx
git commit -m "feat: usual-discount hint with click-to-copy in order flow"
```

---

### Task 4: Editing in customer dialogs

**Files:**
- Modify: `client/src/pages/customers.tsx` (CreateCustomerDialog ~line 424-600: add field near creditLimit field ~583; CustomerDetailsDialog ~line 602+: inline display/edit)
- Modify: `client/src/hooks/use-customers.ts` (extend `useCreateCustomer` payload ~line 307; add `useUpdateCustomerDiscount` mutation modeled on `useUpdateCustomerType`)

**Interfaces:**
- Consumes: `canAccess` from `@/lib/roles`, `useAuth` (user.roles), `usualDiscountLabel` (Task 2).
- Produces: `useUpdateCustomerDiscount(): mutation` with `mutate({ customerId: number, pct: number | null })` — updates `customers.default_discount_pct`, invalidates `['customers']` queries.

- [ ] **Step 1: Add the mutation** in use-customers.ts (copy the shape of `useUpdateCustomerType` ~line where it's defined):

```ts
export function useUpdateCustomerDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, pct }: { customerId: number; pct: number | null }) => {
      const { error } = await supabase
        .from('customers')
        .update({ default_discount_pct: pct })
        .eq('id', customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
```

- [ ] **Step 2: CreateCustomerDialog** — add a "Usual Discount % (optional)" number input (min 0, max 99.99, step 0.5) beside/below the Credit Limit field (~line 583), default empty. On submit include `default_discount_pct: values.usualDiscount === '' || values.usualDiscount == null ? null : values.usualDiscount` in the insert payload (extend `useCreateCustomer` in use-customers.ts to pass it through). DO NOT multiply by 100 — it is a percent, not cents (creditLimit next to it IS cents; don't copy that pattern).

- [ ] **Step 3: CustomerDetailsDialog** — show a "Usual discount" row: for users where `canAccess(user?.roles ?? [], 'ledger-edit')` is false, render plain text (`usualDiscountLabel(...) ?? '—'`); for accounts/admin render a small inline number input + Save button wired to `useUpdateCustomerDiscount` (empty input saves `null`). Toast on success ("Usual discount updated").

- [ ] **Step 4: Verify** — `npx vitest run` green; `npm run check` no new errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/customers.tsx client/src/hooks/use-customers.ts
git commit -m "feat: usual-discount editing in customer dialogs (accounts/admin)"
```

---

### Task 5: Go-live checklist (controller + Karan)

- [ ] **Step 1:** Karan runs the preview SELECT from `supabase-default-discount.sql` in Studio, eyeballs values, then runs the migration+backfill.
- [ ] **Step 2:** Verify via REST: customers of type 3/4/7 with discount history have `default_discount_pct` set; a known sample-box case (100% discount only) stays NULL.
- [ ] **Step 3:** Push branch, check Vercel preview: hint appears for a backfilled customer in new-order flow, click copies value, no input ever pre-fills; details dialog editable as admin.
- [ ] **Step 4:** Merge to main, verify production deploy READY.
