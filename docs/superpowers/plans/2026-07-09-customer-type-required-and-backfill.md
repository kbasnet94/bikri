# Customer Type Required-on-Create + Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop new customers from being created without a customer type, and let existing uncategorized customers be reclassified (one-by-one and in bulk).

**Architecture:** Two new react-query mutations (`useUpdateCustomerType`, `useBulkUpdateCustomerType`) drive all reclassification. Three creation flows gain a required-type guard (active only when the business has ≥1 type). The customers table gains a Type column with an inline quick-set select, a type filter, and a "Categorize" selection mode for bulk assignment. CSV import stays lenient but shows a visible warning for rows that will land uncategorized.

**Tech Stack:** Vite + React + TypeScript, Supabase JS client, @tanstack/react-query, shadcn/ui (Select, Checkbox, Badge), vitest (already installed; one existing test file at `client/src/lib/ledger-math.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-09-customer-type-leak-and-backfill-design.md`

## Global Constraints

- RLS is already satisfied: `customers` has a `FOR ALL` policy ("Users can manage their business customers", `supabase-migration.sql:211`). No SQL migration needed anywhere in this plan.
- Query-key invalidation MUST cover BOTH `['customers']` AND `['customers-with-aging']` — the customers page table reads from `['customers-with-aging', …]`, which the `['customers']` prefix does NOT match. (`['customers']` prefix does cover `['customers', 'type-map', …]` and `['customers', id]`, so the dashboard and details dialog refresh from it.)
- The required-type rule applies ONLY when `(customerTypes || []).length > 0`. With zero types defined, all flows behave exactly as today (field hidden, `customer_type_id` null).
- Radix `SelectItem` must never have `value=""`. Unset selects are represented by controlled `value=""` on `Select` (shows placeholder); the `'none'` sentinel item is being REMOVED from create flows.
- Money stays in cents everywhere (existing convention) — this plan never touches amounts.
- No test framework for UI; UI tasks are verified by driving the dev server (`npm run dev`). Pure logic (Task 6 CSV analysis) is TDD with vitest.
- All work happens in the Bikri 2.0 repo (`C:\Users\Karan2\Desktop\All Cursor Projects\Bikri 2.0`), branch `main`.

---

### Task 1: Reclassification mutations

**Files:**
- Modify: `client/src/hooks/use-customers.ts` (append after `useCreateCustomer`, which ends at line 271)

**Interfaces:**
- Consumes: existing `supabase` client import and `useMutation`/`useQueryClient` imports already present in this file.
- Produces:
  - `useUpdateCustomerType(): UseMutationResult` — `mutateAsync({ customerId: number, customerTypeId: number }): Promise<void>`
  - `useBulkUpdateCustomerType(): UseMutationResult` — `mutateAsync({ customerIds: number[], customerTypeId: number }): Promise<void>`
  - Both invalidate `['customers']` and `['customers-with-aging']` on success. Tasks 4 and 5 import these by name from `@/hooks/use-customers`.

- [ ] **Step 1: Add the two mutation hooks**

Append after the closing brace of `useCreateCustomer` (line 271 of `client/src/hooks/use-customers.ts`):

```typescript
export function useUpdateCustomerType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId, customerTypeId }: { customerId: number; customerTypeId: number }) => {
      const { error } = await supabase
        .from('customers')
        .update({ customer_type_id: customerTypeId })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-aging'] });
    },
  });
}

export function useBulkUpdateCustomerType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerIds, customerTypeId }: { customerIds: number[]; customerTypeId: number }) => {
      const { error } = await supabase
        .from('customers')
        .update({ customer_type_id: customerTypeId })
        .in('id', customerIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-aging'] });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: exits 0 (same as before the change — pre-existing errors, if any, are unchanged; no NEW errors mentioning use-customers.ts)

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/use-customers.ts
git commit -m "feat: add single and bulk customer-type update mutations"
```

---

### Task 2: Required type in Add Customer dialog

**Files:**
- Modify: `client/src/pages/customers.tsx` — `CreateCustomerDialog` (lines 199–276)

**Interfaces:**
- Consumes: nothing new (self-contained UI change).
- Produces: behavior only — save is blocked with inline error "Customer type is required" when types exist and none is picked.

- [ ] **Step 1: Add error state and submit guard**

In `CreateCustomerDialog`, below the existing `const [selectedTypeId, setSelectedTypeId] = useState<string>("");` (line 204), add:

```typescript
  const [typeError, setTypeError] = useState(false);
```

Replace the start of `onSubmit` (lines 225–232) so the guard runs before the mutation:

```typescript
  const onSubmit = async (values: any) => {
    if ((customerTypes || []).length > 0 && (!selectedTypeId || selectedTypeId === 'none')) {
      setTypeError(true);
      return;
    }
    try {
      const creditLimitInCents = Math.round(values.creditLimit * 100);
      await createCustomer.mutateAsync({
        ...values,
        creditLimit: creditLimitInCents,
        customerTypeId: selectedTypeId && selectedTypeId !== 'none' ? parseInt(selectedTypeId) : null,
      });
```

(The rest of `onSubmit` is unchanged, except add `setTypeError(false);` right after `setSelectedTypeId("");` in the success path.)

- [ ] **Step 2: Make the select required in the UI**

Replace the Customer Type block (lines 261–276) with:

```tsx
            {(customerTypes || []).length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Type *</label>
                <Select
                  value={selectedTypeId}
                  onValueChange={(v) => { setSelectedTypeId(v); setTypeError(false); }}
                >
                  <SelectTrigger data-testid="select-customer-type" className={typeError ? "border-destructive" : undefined}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes!.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeError && (
                  <p className="text-sm font-medium text-destructive" data-testid="error-customer-type">
                    Customer type is required
                  </p>
                )}
              </div>
            )}
```

Note the `None` item is gone and the placeholder no longer says "(optional)".

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open the app, Customers → Add Customer.
Expected: submitting with name filled but no type shows red "Customer type is required" under the select and does NOT create; picking a type clears the error; create then succeeds and the new customer shows that type.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/customers.tsx
git commit -m "feat: require customer type in Add Customer dialog"
```

---

### Task 3: Required type in orders inline create

**Files:**
- Modify: `client/src/pages/orders.tsx` — `handleCreateCustomer` (lines 1215–1245) and the inline form's type select (lines 1454–1469)

**Interfaces:**
- Consumes: nothing new.
- Produces: behavior only — "Create & Select" blocked via destructive toast when types exist and none picked (toast matches this form's existing validation style for name/phone).

- [ ] **Step 1: Add the guard**

In `handleCreateCustomer`, after the phone validation block (line 1223), insert:

```typescript
    if ((customerTypes || []).length > 0 && (!newCustomerTypeId || newCustomerTypeId === 'none')) {
      toast({ title: "Customer type is required", variant: "destructive" });
      return;
    }
```

- [ ] **Step 2: Update the select UI**

Replace lines 1454–1469 with:

```tsx
                    {(customerTypes || []).length > 0 && (
                      <div>
                        <Label className="text-xs">Customer Type *</Label>
                        <Select value={newCustomerTypeId} onValueChange={setNewCustomerTypeId}>
                          <SelectTrigger className="h-9" data-testid="select-new-customer-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {customerTypes!.map(t => (
                              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, Orders → New Order → New Customer; fill name only, click "Create & Select".
Expected: destructive toast "Customer type is required", no customer created. Pick a type → creation succeeds and customer is selected.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/orders.tsx
git commit -m "feat: require customer type in order-flow inline customer create"
```

---

### Task 4: Quick-set type (table column + details dialog)

**Files:**
- Modify: `client/src/pages/customers.tsx` — `Customers` component (lines 49–197) and `CustomerDetailsDialog` header (lines 562–580)

**Interfaces:**
- Consumes: `useUpdateCustomerType` from Task 1 (`import { ..., useUpdateCustomerType } from "@/hooks/use-customers"` — extend the existing import), `useCustomerTypes` from `@/hooks/use-customer-types` (already imported at module level), `useToast` (already imported).
- Produces: behavior only. Note for Task 5: this task adds `const { data: customerTypes } = useCustomerTypes();` and `const { toast } = useToast();` to the `Customers` component — Task 5 reuses those, do not re-declare.

- [ ] **Step 1: Add hooks and handler to `Customers`**

Inside `Customers` (after line 57, `const { data: customers, isLoading } = useCustomersWithAging(search);`), add:

```typescript
  const { data: customerTypes } = useCustomerTypes();
  const updateCustomerType = useUpdateCustomerType();
  const { toast } = useToast();

  const handleQuickSetType = async (customerId: number, typeId: number) => {
    try {
      await updateCustomerType.mutateAsync({ customerId, customerTypeId: typeId });
      toast({ title: "Customer type updated" });
    } catch (error: any) {
      toast({ title: "Failed to update type", description: error.message, variant: "destructive" });
    }
  };
```

- [ ] **Step 2: Add the Type column**

In the table header (lines 95–104), insert after `<TableHead>Contact</TableHead>`:

```tsx
              <TableHead>Type</TableHead>
```

Update BOTH loading/empty `colSpan={8}` values (lines 109 and 113) to `colSpan={9}`.

In the row render, insert a new cell after the Contact `</TableCell>` (line 139):

```tsx
                  <TableCell>
                    {(customerTypes || []).length > 0 ? (
                      <Select
                        value={customer.customer_type_id ? String(customer.customer_type_id) : ""}
                        onValueChange={(v) => handleQuickSetType(customer.id, parseInt(v))}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-7 w-36 text-xs",
                            !customer.customer_type_id && "text-muted-foreground italic"
                          )}
                          data-testid={`select-type-${customer.id}`}
                        >
                          <SelectValue placeholder="Uncategorized" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerTypes!.map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        {customer.customer_type?.name || "Uncategorized"}
                      </span>
                    )}
                  </TableCell>
```

Remove the now-redundant type Badge from the Name cell (delete lines 122–126, the `{customer.customer_type && (<Badge …>…</Badge>)}` block).

- [ ] **Step 3: Add the selector to `CustomerDetailsDialog`**

In `CustomerDetailsDialog`, add hooks below the existing `const { toast } = useToast();` area (near line 369):

```typescript
  const { data: customerTypes } = useCustomerTypes();
  const updateCustomerType = useUpdateCustomerType();

  const handleSetType = async (typeId: number) => {
    try {
      await updateCustomerType.mutateAsync({ customerId: customer.id, customerTypeId: typeId });
      toast({ title: "Customer type updated" });
    } catch (error: any) {
      toast({ title: "Failed to update type", description: error.message, variant: "destructive" });
    }
  };
```

Replace the header Badge block (lines 565–570):

```tsx
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-display font-bold">{customer.name}</h2>
                {(customerTypes || []).length > 0 ? (
                  <Select
                    value={customer.customer_type_id ? String(customer.customer_type_id) : ""}
                    onValueChange={(v) => handleSetType(parseInt(v))}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-7 w-36 text-xs",
                        !customer.customer_type_id && "text-muted-foreground italic"
                      )}
                      data-testid="select-detail-customer-type"
                    >
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerTypes!.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : customer.customer_type ? (
                  <Badge variant="secondary" className="text-xs">{customer.customer_type.name}</Badge>
                ) : null}
              </div>
```

(`useCustomer(customerProp.id)`'s key `['customers', id]` is invalidated by the mutation, so the dialog re-renders with the new type.)

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, Customers page.
Expected: Type column shows each customer's type; uncategorized rows show italic "Uncategorized" placeholder. Changing a row's select toasts "Customer type updated" and persists on reload. Open Details on an uncategorized customer → same selector in header works. Dashboard → that customer's revenue leaves the "Uncategorized" pie slice.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run check` — no new errors.

```bash
git add client/src/pages/customers.tsx
git commit -m "feat: inline quick-set customer type in table and details dialog"
```

---

### Task 5: Type filter + Categorize mode (bulk assign)

**Files:**
- Modify: `client/src/pages/customers.tsx` — `Customers` component only

**Interfaces:**
- Consumes: `useBulkUpdateCustomerType` from Task 1 (extend the `@/hooks/use-customers` import); `customerTypes` and `toast` already in scope from Task 4; `Checkbox` from `@/components/ui/checkbox` (new import at top of file: `import { Checkbox } from "@/components/ui/checkbox";`).
- Produces: behavior only.

- [ ] **Step 1: Add state and derived list**

Inside `Customers`, after Task 4's additions:

```typescript
  const bulkUpdateCustomerType = useBulkUpdateCustomerType();
  const [typeFilter, setTypeFilter] = useState<string>("all"); // 'all' | 'none' | String(typeId)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTypeId, setBulkTypeId] = useState<string>("");

  const filteredCustomers = (customers || []).filter(c => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'none') return !c.customer_type_id;
    return c.customer_type_id === parseInt(typeFilter);
  });

  const changeTypeFilter = (v: string) => {
    setTypeFilter(v);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredCustomers.map(c => c.id)));
  };

  const handleBulkAssign = async () => {
    if (!bulkTypeId || selectedIds.size === 0) return;
    try {
      await bulkUpdateCustomerType.mutateAsync({
        customerIds: Array.from(selectedIds),
        customerTypeId: parseInt(bulkTypeId),
      });
      toast({ title: `${selectedIds.size} customer(s) updated` });
      setSelectedIds(new Set());
      setBulkTypeId("");
    } catch (error: any) {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
    }
  };
```

- [ ] **Step 2: Render filter + Select toggle + action bar**

Replace the search-input block (lines 82–90) with a controls row (search unchanged inside it):

```tsx
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, email, or phone..." 
            className="pl-9 bg-card border-border/60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(customerTypes || []).length > 0 && (
          <Select value={typeFilter} onValueChange={changeTypeFilter}>
            <SelectTrigger className="w-44 bg-card" data-testid="select-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="none">Uncategorized</SelectItem>
              {customerTypes!.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {typeFilter !== 'all' && (
          <Button
            variant={selectMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            data-testid="button-select-mode"
          >
            {selectMode ? "Done" : "Select"}
          </Button>
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3" data-testid="bulk-action-bar">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Select value={bulkTypeId} onValueChange={setBulkTypeId}>
            <SelectTrigger className="w-44 h-9 bg-card" data-testid="select-bulk-type">
              <SelectValue placeholder="Assign type..." />
            </SelectTrigger>
            <SelectContent>
              {(customerTypes || []).map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleBulkAssign}
            disabled={!bulkTypeId || bulkUpdateCustomerType.isPending}
            data-testid="button-bulk-assign"
          >
            {bulkUpdateCustomerType.isPending ? "Applying..." : `Apply to ${selectedIds.size} customer(s)`}
          </Button>
        </div>
      )}
```

- [ ] **Step 3: Wire the table to the filtered list + checkbox column**

Change the body iteration source from `customers?.map` to `filteredCustomers.map` and the empty check from `customers?.length === 0` to `filteredCustomers.length === 0`.

In the header row, before `<TableHead>Name</TableHead>`:

```tsx
              {selectMode && (
                <TableHead className="w-10">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} data-testid="checkbox-select-all" />
                </TableHead>
              )}
```

In each row, before the Name `<TableCell>`:

```tsx
                  {selectMode && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(customer.id)}
                        onCheckedChange={() => toggleSelected(customer.id)}
                        data-testid={`checkbox-customer-${customer.id}`}
                      />
                    </TableCell>
                  )}
```

Update loading/empty colSpans from `9` (Task 4) to `{selectMode ? 10 : 9}`.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, Customers page.
Expected: filter to "Uncategorized" → only untyped customers listed; "Select" button appears; enabling it shows checkboxes; select-all + choosing a type + Apply updates all, list empties (they now have types), toast shows count; dashboard Uncategorized slice shrinks accordingly. Switching filter resets selection.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run check` — no new errors.

```bash
git add client/src/pages/customers.tsx
git commit -m "feat: type filter and bulk categorize mode on customers table"
```

---

### Task 6: CSV import warning (TDD)

**Files:**
- Create: `client/src/lib/csv-customer-types.ts`
- Test: `client/src/lib/csv-customer-types.test.ts`
- Modify: `client/src/pages/customers.tsx` — `BulkCustomerUploadDialog` (lines 786–1001)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `findUntypedRows(rows: { customerType?: string }[], typeNames: string[]): number[]` — indexes of rows whose `customerType` is blank/whitespace or matches no type name (case-insensitive).

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/csv-customer-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findUntypedRows } from './csv-customer-types';

describe('findUntypedRows', () => {
  const typeNames = ['Retail', 'Wholesale'];

  it('flags rows with blank or missing customerType', () => {
    const rows = [
      { customerType: 'Retail' },
      { customerType: '' },
      {},
      { customerType: '   ' },
    ];
    expect(findUntypedRows(rows, typeNames)).toEqual([1, 2, 3]);
  });

  it('flags rows whose type matches no existing name', () => {
    const rows = [
      { customerType: 'Retail' },
      { customerType: 'Retial' },
      { customerType: 'Distributor' },
    ];
    expect(findUntypedRows(rows, typeNames)).toEqual([1, 2]);
  });

  it('matches case-insensitively and trims', () => {
    const rows = [
      { customerType: 'retail' },
      { customerType: ' WHOLESALE ' },
    ];
    expect(findUntypedRows(rows, typeNames)).toEqual([]);
  });

  it('flags every row when no types exist', () => {
    expect(findUntypedRows([{ customerType: 'Retail' }], [])).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/csv-customer-types.test.ts`
Expected: FAIL — cannot resolve `./csv-customer-types`

- [ ] **Step 3: Implement**

Create `client/src/lib/csv-customer-types.ts`:

```typescript
/**
 * Returns the indexes of CSV rows whose customerType is blank or does not
 * match any existing type name (case-insensitive, trimmed). These rows will
 * be imported with customer_type_id = null ("Uncategorized").
 */
export function findUntypedRows(
  rows: { customerType?: string }[],
  typeNames: string[]
): number[] {
  const known = new Set(typeNames.map(n => n.toLowerCase()));
  const untyped: number[] = [];
  rows.forEach((row, i) => {
    const name = row.customerType?.trim();
    if (!name || !known.has(name.toLowerCase())) untyped.push(i);
  });
  return untyped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/csv-customer-types.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into `BulkCustomerUploadDialog`**

Add imports at the top of `client/src/pages/customers.tsx`:

```typescript
import { findUntypedRows } from "@/lib/csv-customer-types";
```

Also extend the react import on line 1 — it is currently `import { useState, useRef, useEffect } from "react";` — to:

```typescript
import { useState, useRef, useEffect, useMemo } from "react";
```

Inside `BulkCustomerUploadDialog`, after `const previewRows = parsedRows.slice(0, 5);` (line 926):

```typescript
  const untypedRowIndexes = useMemo(
    () => findUntypedRows(parsedRows, (customerTypes || []).map(t => t.name)),
    [parsedRows, customerTypes]
  );
  const untypedSet = new Set(untypedRowIndexes);
```

In the JSX, directly above the preview `<div className="border rounded-lg overflow-auto max-h-48">` (line 963), add:

```tsx
              {untypedRowIndexes.length > 0 && (
                <div
                  className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300"
                  data-testid="warning-untyped-rows"
                >
                  {untypedRowIndexes.length} of {parsedRows.length} row(s) have a blank or unmatched
                  customer type and will be imported as Uncategorized.
                </div>
              )}
```

Highlight affected preview rows — change the preview `<TableRow>` (line 972):

```tsx
                    {previewRows.map((row, i) => (
                      <TableRow
                        key={i}
                        data-testid={`preview-row-${i}`}
                        className={cn(untypedSet.has(i) && "bg-amber-50 dark:bg-amber-900/10")}
                      >
```

Update the header hint copy (line 943) from `must match an existing type name (optional).` to:

```
must match an existing type name; blank or unmatched values import as Uncategorized.
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`, Customers → Upload Customers; upload a CSV with 3 rows: one valid type, one blank, one typo (e.g. "Retial").
Expected: warning box reads "2 of 3 row(s)…", the two bad preview rows are amber-tinted, upload still succeeds and creates all 3 (two as Uncategorized).

- [ ] **Step 7: Run all tests, typecheck, commit**

Run: `npx vitest run` — all pass (including existing `ledger-math.test.ts`).
Run: `npm run check` — no new errors.

```bash
git add client/src/lib/csv-customer-types.ts client/src/lib/csv-customer-types.test.ts client/src/pages/customers.tsx
git commit -m "feat: warn on CSV rows importing as uncategorized customer type"
```

---

### Task 7: End-to-end verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full manual drive per spec**

Run: `npm run dev` and walk the spec's verification list:
1. Add Customer without type → blocked inline. Orders inline create without type → blocked toast.
2. Quick-set one uncategorized customer → dashboard pie moves their revenue out of Uncategorized.
3. Filter Uncategorized → Select → select-all → bulk assign → filtered list empties.
4. CSV with one blank-type and one typo-type row → "2 of N" warning, rows highlighted, import succeeds.

- [ ] **Step 2: Final checks and push**

Run: `npx vitest run` and `npm run check` — clean.

```bash
git push
```
