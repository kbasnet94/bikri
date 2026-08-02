# Payment-Status Defaults + Export Exclusion + Integrity Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Business-type customers default to Credit in the new-order dialog with a soft warning on COD/Bank-QR; ledger exports exclude cancelled orders; a read-only integrity script checks ledger/order/balance agreement.

**Architecture:** A new `is_business` boolean on `customer_types` drives pure helpers in `client/src/lib/payment-defaults.ts` (vitest-covered, same pattern as `ledger-math.ts`). The new-order dialog consumes the helpers; the XLSX export filters cancelled-order entries using order statuses fetched inside the export function; `script/integrity-check.ts` mirrors `script/repair-balances.ts` (service role, read-only).

**Tech Stack:** React + TypeScript, Supabase (PostgREST), TanStack Query, shadcn/ui, vitest, tsx.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-payment-status-defaults-export-integrity-design.md`.
- New orders only — no backfill, no changes to historical orders/entries. The 14 held COD/Bank orders (see allowlist in Task 6) must NOT be corrected.
- Behavior keys off `is_business`, never off type names.
- Money is integer cents everywhere (existing convention).
- All Supabase list fetches must paginate with stable `.order('id')` (PostgREST 1000-row cap).
- Integrity script never writes to the database.
- Do NOT `git push` — Karan verifies on localhost:5000 first; `main` auto-deploys on push.

---

### Task 1: `is_business` column + migration SQL + hook support

**Files:**
- Create: `supabase-customer-type-is-business.sql`
- Modify: `client/src/hooks/use-customer-types.ts` (interface + new mutation)
- Modify: `client/src/hooks/use-customers.ts` (3 selects joining `customer_type:customer_types(id, name)` — lines ~62, ~110, ~280)

**Interfaces:**
- Consumes: existing `CustomerType`, `useCustomerTypes` query key `['customer-types', businessId]`.
- Produces: `CustomerType.is_business: boolean`; `useSetCustomerTypeBusiness()` mutation taking `{ id: number; isBusiness: boolean }`; customer objects whose `customer_type` join includes `is_business`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase-customer-type-is-business.sql
-- Spec: docs/superpowers/specs/2026-08-02-payment-status-defaults-export-integrity-design.md
-- 1) Schema: wholesale/credit flag on customer types.
ALTER TABLE customer_types
  ADD COLUMN IF NOT EXISTS is_business boolean NOT NULL DEFAULT false;

-- 2) One-time config (Hydralyte business): wholesale types default to Credit.
UPDATE customer_types SET is_business = true
WHERE lower(name) IN ('gym', 'retail', 'pharmacy');

-- Sanity: expect Gym/Retail/Pharmacy true, Consumer false.
-- SELECT name, is_business FROM customer_types ORDER BY name;
```

- [ ] **Step 2: Run the migration in the Supabase SQL editor** (same manual pattern as every other `supabase-*.sql` file). Run the commented SELECT and confirm Gym/Retail/Pharmacy are `true`, Consumer `false`.

- [ ] **Step 3: Update the hook.** In `use-customer-types.ts`: add `is_business: boolean;` to the `CustomerType` interface, and add below `useCreateCustomerType`:

```ts
export function useSetCustomerTypeBusiness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isBusiness }: { id: number; isBusiness: boolean }) => {
      const { error } = await supabase
        .from('customer_types')
        .update({ is_business: isBusiness })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
```

- [ ] **Step 4: Widen the customer joins.** In `use-customers.ts`, change all three occurrences of `customer_type:customer_types(id, name)` to `customer_type:customer_types(id, name, is_business)`.

- [ ] **Step 5: Typecheck.** Run: `npx tsc --noEmit`. Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase-customer-type-is-business.sql client/src/hooks/use-customer-types.ts client/src/hooks/use-customers.ts
git commit -m "feat: is_business flag on customer types (schema + hooks)"
```

---

### Task 2: Pure payment-default helpers + tests

**Files:**
- Create: `client/src/lib/payment-defaults.ts`
- Test: `client/src/lib/payment-defaults.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `isBusinessCustomer(customer: { customer_type?: { is_business?: boolean } | null } | null | undefined): boolean`; `defaultPaymentStatus(customer): 'Credit' | ''`; `needsBusinessPaymentWarning(customer, selected: string): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
// client/src/lib/payment-defaults.test.ts
import { describe, it, expect } from 'vitest';
import { isBusinessCustomer, defaultPaymentStatus, needsBusinessPaymentWarning } from './payment-defaults';

const biz = { customer_type: { is_business: true } };
const consumer = { customer_type: { is_business: false } };
const untyped = { customer_type: null };

describe('isBusinessCustomer', () => {
  it('true only when the joined type has is_business', () => {
    expect(isBusinessCustomer(biz)).toBe(true);
    expect(isBusinessCustomer(consumer)).toBe(false);
    expect(isBusinessCustomer(untyped)).toBe(false);
    expect(isBusinessCustomer(null)).toBe(false);
    expect(isBusinessCustomer(undefined)).toBe(false);
  });
});

describe('defaultPaymentStatus', () => {
  it('Credit for business customers, empty otherwise', () => {
    expect(defaultPaymentStatus(biz)).toBe('Credit');
    expect(defaultPaymentStatus(consumer)).toBe('');
    expect(defaultPaymentStatus(untyped)).toBe('');
    expect(defaultPaymentStatus(null)).toBe('');
  });
});

describe('needsBusinessPaymentWarning', () => {
  it('fires only for business customers picking COD or Bank Transfer/QR', () => {
    expect(needsBusinessPaymentWarning(biz, 'COD')).toBe(true);
    expect(needsBusinessPaymentWarning(biz, 'Bank Transfer/QR')).toBe(true);
    expect(needsBusinessPaymentWarning(biz, 'Credit')).toBe(false);
    expect(needsBusinessPaymentWarning(consumer, 'COD')).toBe(false);
    expect(needsBusinessPaymentWarning(untyped, 'Bank Transfer/QR')).toBe(false);
    expect(needsBusinessPaymentWarning(biz, '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npx vitest run client/src/lib/payment-defaults.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// client/src/lib/payment-defaults.ts
// Payment-status defaults driven by the customer type's is_business flag
// (spec 2026-08-02). Wholesale/business clients buy on Credit and settle
// later; auto-paid statuses (COD, Bank Transfer/QR) book a payment entry
// at creation and are almost always a mistake for them.

type CustomerLike = { customer_type?: { is_business?: boolean } | null } | null | undefined;

const AUTO_PAID_STATUSES = new Set(['COD', 'Bank Transfer/QR']);

export function isBusinessCustomer(customer: CustomerLike): boolean {
  return customer?.customer_type?.is_business === true;
}

export function defaultPaymentStatus(customer: CustomerLike): 'Credit' | '' {
  return isBusinessCustomer(customer) ? 'Credit' : '';
}

export function needsBusinessPaymentWarning(customer: CustomerLike, selected: string): boolean {
  return isBusinessCustomer(customer) && AUTO_PAID_STATUSES.has(selected);
}
```

- [ ] **Step 4: Run tests.** Run: `npx vitest run client/src/lib/payment-defaults.test.ts`. Expected: PASS (3 suites).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/payment-defaults.ts client/src/lib/payment-defaults.test.ts
git commit -m "feat: payment-default helpers keyed off is_business"
```

---

### Task 3: Business checkbox in the Customer Types card

**Files:**
- Modify: `client/src/pages/account.tsx` (`CustomerTypesCard`, ~line 686)

**Interfaces:**
- Consumes: `useSetCustomerTypeBusiness()` from Task 1; `CustomerType.is_business`.
- Produces: UI only.

- [ ] **Step 1: Add the mutation + toggle UI.** In `CustomerTypesCard`, add `const setBusiness = useSetCustomerTypeBusiness();` (import it alongside the existing customer-type hooks). Replace the plain type `Badge` rendering with a badge that includes a wholesale toggle. The existing map renders `<Badge>` per type; extend each badge's content:

```tsx
{customerTypes?.map(type => (
  <Badge
    key={type.id}
    variant="secondary"
    className="flex items-center gap-2 pl-3 pr-1 py-1"
    data-testid={`badge-customer-type-${type.id}`}
  >
    {type.name}
    <button
      type="button"
      title={type.is_business
        ? "Wholesale/credit type — new orders default to Credit"
        : "Mark as wholesale/credit type"}
      onClick={async () => {
        try {
          await setBusiness.mutateAsync({ id: type.id, isBusiness: !type.is_business });
        } catch (error: any) {
          toast({ title: "Failed to update type", description: error.message, variant: "destructive" });
        }
      }}
      className={cn(
        "text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border",
        type.is_business
          ? "bg-primary/10 text-primary border-primary/30"
          : "text-muted-foreground border-border"
      )}
      data-testid={`toggle-business-${type.id}`}
    >
      {type.is_business ? "Wholesale" : "Retail/D2C"}
    </button>
    {/* keep the existing delete (X) button here unchanged */}
  </Badge>
))}
```

Keep the existing delete button inside the badge exactly as it is today. Import `cn` from `@/lib/utils` if not already imported in the file.

- [ ] **Step 2: Update the card description** to explain the toggle: change `CardDescription` text to `Manage customer categories. "Wholesale" types default new orders to Credit.`

- [ ] **Step 3: Verify manually.** Run `npm run dev`, open Account → Customer Types on localhost:5000. Expected: Gym/Retail/Pharmacy show "Wholesale" (from Task 1 migration), Consumer shows "Retail/D2C"; clicking toggles and persists after refresh.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add client/src/pages/account.tsx
git commit -m "feat: wholesale toggle on customer types card"
```

---

### Task 4: Pre-fill + soft warning in the new-order dialog

**Files:**
- Modify: `client/src/pages/orders.tsx` (`CreateOrderDialog`, ~lines 1305–1360 state, ~2016–2035 payment select)

**Interfaces:**
- Consumes: `defaultPaymentStatus`, `needsBusinessPaymentWarning` from Task 2; `selectedCustomer` (already carries `customer_type` with `is_business` after Task 1).
- Produces: UI behavior only. New state: `paymentTouched: boolean`, `pendingWarnStatus: "COD" | "Bank Transfer/QR" | null`.

- [ ] **Step 1: Add imports and state.** At the top of orders.tsx add
`import { defaultPaymentStatus, needsBusinessPaymentWarning } from "@/lib/payment-defaults";`
and `import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";` (skip any already imported). In `CreateOrderDialog`, next to the existing `paymentStatus` state (~line 1321) add:

```tsx
const [paymentTouched, setPaymentTouched] = useState(false);
const [pendingWarnStatus, setPendingWarnStatus] = useState<"COD" | "Bank Transfer/QR" | null>(null);
```

- [ ] **Step 2: Derive the default when the customer changes.** The dialog already resets location/channel on `customerId` change (~line 1335). Add a parallel effect:

```tsx
// Business-type customers buy on Credit (spec 2026-08-02). Re-derive on
// customer change, but never clobber an explicit choice this session.
useEffect(() => {
  if (!paymentTouched) {
    setPaymentStatus(defaultPaymentStatus(selectedCustomer));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedCustomer]);
```

- [ ] **Step 3: Route selections through the warning.** Replace the payment `Select`'s `onValueChange` (~line 2018):

```tsx
<Select
  value={paymentStatus}
  onValueChange={(val: "COD" | "Bank Transfer/QR" | "Credit") => {
    if (needsBusinessPaymentWarning(selectedCustomer, val)) {
      setPendingWarnStatus(val as "COD" | "Bank Transfer/QR");
      return; // don't change the field until confirmed
    }
    setPaymentStatus(val);
    setPaymentTouched(true);
  }}
>
```

- [ ] **Step 4: Add the confirm dialog.** Directly after the payment-status `<div className="space-y-2">` block:

```tsx
<AlertDialog open={pendingWarnStatus !== null} onOpenChange={(o) => { if (!o) setPendingWarnStatus(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Wholesale client — mark as already paid?</AlertDialogTitle>
      <AlertDialogDescription>
        {selectedCustomer?.name} is a wholesale client — {pendingWarnStatus} will mark this
        order as already paid and record the payment in their ledger. Continue?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel data-testid="cancel-business-payment-warning">Keep Credit</AlertDialogCancel>
      <AlertDialogAction
        data-testid="confirm-business-payment-warning"
        onClick={() => {
          if (pendingWarnStatus) {
            setPaymentStatus(pendingWarnStatus);
            setPaymentTouched(true);
          }
          setPendingWarnStatus(null);
        }}
      >
        Continue
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 5: Reset the session flag when the dialog closes/resets.** Find `CreateOrderDialog`'s existing reset path (the code that clears `customerId`, `cart`, `paymentStatus` etc. when the dialog closes or after submit) and add `setPaymentTouched(false); setPendingWarnStatus(null);` alongside the existing `setPaymentStatus("")`.

- [ ] **Step 6: Verify manually on localhost:5000.**
  - New order → pick N&H Grocer (Retail type): payment pre-fills Credit.
  - Select Bank Transfer/QR: warning appears; Cancel reverts to Credit; Confirm sets Bank/QR.
  - New order → pick a Consumer-type customer: field empty, no warning on Bank/QR, submit blocked until chosen (existing guard at ~line 1516).
  - Switch customer after manually choosing a status: choice survives (touched flag).

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add client/src/pages/orders.tsx
git commit -m "feat: Credit default + wholesale soft warning in new-order dialog"
```

---

### Task 5: Ledger export excludes cancelled orders

**Files:**
- Modify: `client/src/pages/customers.tsx` (`downloadLedgerXLSX`, ~line 796)

**Interfaces:**
- Consumes: existing `ledger`, `filteredLedger`, `openingBalance` values in the dialog component; `ledgerBalanceDelta` from `@/lib/ledger-math` (already imported); `supabase` client (already imported in the file's hook usage — import directly: `import { supabase } from "@/lib/supabase";` if not present).
- Produces: exports whose rows and opening balance skip entries tied to cancelled orders. The in-app dialog display is NOT changed.

- [ ] **Step 1: Fetch cancelled order IDs inside the export.** At the top of `downloadLedgerXLSX`, before building the workbook:

```ts
// Exports follow the app's balance convention: entries tied to cancelled
// orders are excluded (spec 2026-08-02). The in-app dialog still shows them.
const { data: cancelledRows, error: cancelledErr } = await supabase
  .from('orders')
  .select('id')
  .eq('customer_id', customer.id)
  .eq('status', 'cancelled');
if (cancelledErr) {
  toast({ title: "Export failed", description: cancelledErr.message, variant: "destructive" });
  return;
}
const cancelledIds = new Set((cancelledRows || []).map((o) => o.id));
const notCancelled = (e: { order_id: number | null }) =>
  e.order_id === null || !cancelledIds.has(e.order_id);
```

(A customer's cancelled orders are far below the 1000-row cap; no pagination needed here.)

- [ ] **Step 2: Filter the exported rows.** Change the `entriesToExport` line to apply the filter:

```ts
const entriesToExport = (exportMode === 'all' ? (ledger || []) : filteredLedger).filter(notCancelled);
```

- [ ] **Step 3: Recompute the opening balance for the export.** The component-level `openingBalance` (used by the dialog display) stays untouched. Inside `downloadLedgerXLSX`, shadow it for the export:

```ts
const exportOpeningBalance = (exportMode === 'fiscal' && openingBalance !== null && fyDates && ledger)
  ? ledger.reduce((sum, entry) => {
      if (!notCancelled(entry)) return sum;
      const entryDate = toLocalDate(entry.entry_date!);
      const startDate = new Date(fyDates.start.getFullYear(), fyDates.start.getMonth(), fyDates.start.getDate());
      return entryDate < startDate ? sum + ledgerBalanceDelta(entry.type, entry.amount) : sum;
    }, 0)
  : null;
```

Then replace both uses of `openingBalance` inside `downloadLedgerXLSX` (the empty-export guard and the opening-row `writeRow` block) with `exportOpeningBalance`.

- [ ] **Step 4: Verify with the real case.** On localhost:5000, export N&H Grocer Pvt. Ltd for FY 2082/83. Expected: no "cancelled - reversed" rows, no cancelled orders' purchase rows (#1769/#1770/#1779/#2538/#2567 and #2848's pair absent; #1859's pair still present — that order is completed), closing balance **522,135.36**.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add client/src/pages/customers.tsx
git commit -m "feat: ledger exports exclude cancelled orders (match balance convention)"
```

---

### Task 6: `script/integrity-check.ts`

**Files:**
- Create: `script/integrity-check.ts`
- Modify: `package.json` (add script `"integrity-check": "tsx script/integrity-check.ts"`)

**Interfaces:**
- Consumes: `.env` (`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), same as `script/repair-balances.ts`; `computeCustomerBalance` from `../client/src/lib/ledger-math`.
- Produces: console report; exit code 1 when non-allowlisted findings exist. Never writes.

- [ ] **Step 1: Write the script**

```ts
// Read-only ledger integrity check (spec 2026-08-02). Run any time:
//   npm run integrity-check
// Checks: (1) active orders' ledger entries match order totals,
// (2) cancelled orders net to zero, (3) stored balances match the ledger.
// NEVER writes to the database.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeCustomerBalance } from '../client/src/lib/ledger-math';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Known/held findings — 14 pre-2026-07-16 COD/Bank orders with stale-but-
// netting entries, held pending VAT-bill verification (Karan, 2026-08-02).
// Resolving an order = fixing its data AND removing its ID here.
const HELD_ORDER_IDS = new Set([
  1771, 1830, 1951, 2053, 2090, 2199, 2200, 2296, 2458, 2516, 2745, 2858, 2949, 2953,
]);

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Stable ordering is load-bearing: PostgREST range pagination without a
// unique sort returns duplicated/missing rows across pages.
async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data) return rows;
    rows.push(...(data as T[]));
    if (data.length < page) return rows;
  }
}

type OrderRow = { id: number; status: string; payment_status: string; total_amount: number; customer_id: number };
type EntryRow = { id: number; customer_id: number; type: string; amount: number; order_id: number | null };
type CustomerRow = { id: number; name: string; current_balance: number };

const REDUCING = new Set(['credit', 'payment']);
const npr = (cents: number) => (cents / 100).toFixed(2);

async function main() {
  const orders = await fetchAll<OrderRow>('orders', 'id,status,payment_status,total_amount,customer_id');
  const entries = await fetchAll<EntryRow>('ledger_entries', 'id,customer_id,type,amount,order_id');
  const customers = await fetchAll<CustomerRow>('customers', 'id,name,current_balance');
  const custName = new Map(customers.map((c) => [c.id, c.name]));

  const byOrder = new Map<number, EntryRow[]>();
  for (const e of entries) {
    if (e.order_id === null) continue;
    const list = byOrder.get(e.order_id) ?? [];
    list.push(e);
    byOrder.set(e.order_id, list);
  }

  let findings = 0;
  let held = 0;
  const report = (heldFinding: boolean, msg: string) => {
    if (heldFinding) { held++; console.log(`  [held] ${msg}`); }
    else { findings++; console.log(`  ${msg}`); }
  };

  console.log('=== 1. Active orders: ledger entries vs order total ===');
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const le = byOrder.get(o.id) ?? [];
    const purchase = le.filter((e) => e.type === 'purchase').reduce((s, e) => s + e.amount, 0);
    const payment = le.filter((e) => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
    const isHeld = HELD_ORDER_IDS.has(o.id);
    if (purchase !== o.total_amount) {
      report(isHeld, `order #${o.id} [${o.payment_status}] "${custName.get(o.customer_id)}": purchase ${npr(purchase)} != total ${npr(o.total_amount)}`);
    }
    if ((o.payment_status === 'COD' || o.payment_status === 'Bank Transfer/QR') && payment !== o.total_amount) {
      report(isHeld, `order #${o.id} [${o.payment_status}] "${custName.get(o.customer_id)}": auto-payment ${npr(payment)} != total ${npr(o.total_amount)}`);
    }
  }

  console.log('\n=== 2. Cancelled orders: net to zero ===');
  for (const o of orders) {
    if (o.status !== 'cancelled') continue;
    const le = byOrder.get(o.id) ?? [];
    const dr = le.filter((e) => !REDUCING.has(e.type)).reduce((s, e) => s + e.amount, 0);
    const cr = le.filter((e) => REDUCING.has(e.type)).reduce((s, e) => s + e.amount, 0);
    if (dr !== cr) {
      report(false, `cancelled order #${o.id} "${custName.get(o.customer_id)}": dr ${npr(dr)} != cr ${npr(cr)} (phantom ${npr(dr - cr)})`);
    }
  }

  console.log('\n=== 3. Stored balances vs ledger ===');
  const cancelledIds = new Set(orders.filter((o) => o.status === 'cancelled').map((o) => o.id));
  const byCustomer = new Map<number, EntryRow[]>();
  for (const e of entries) {
    const list = byCustomer.get(e.customer_id) ?? [];
    list.push(e);
    byCustomer.set(e.customer_id, list);
  }
  for (const c of customers) {
    const computed = computeCustomerBalance(byCustomer.get(c.id) ?? [], cancelledIds);
    if (computed !== c.current_balance) {
      report(false, `customer #${c.id} "${c.name}": stored ${npr(c.current_balance)} != ledger ${npr(computed)}`);
    }
  }

  console.log(`\nDone. New findings: ${findings}. Held (VAT verification pending, 2026-08-02): ${held}.`);
  if (findings > 0) process.exitCode = 1;
}

main();
```

- [ ] **Step 2: Add the npm script.** In `package.json` scripts, after `"test"`: `"integrity-check": "tsx script/integrity-check.ts",`.

- [ ] **Step 3: Run it.** Run: `npm run integrity-check`. Expected: sections 2 and 3 clean; section 1 shows exactly the 14 held orders (each line prefixed `[held]`, and note Group A shows both purchase and auto-payment lines for the same order); final line `New findings: 0. Held ...: 14+` and **exit code 0**.

- [ ] **Step 4: Commit**

```bash
git add script/integrity-check.ts package.json
git commit -m "feat: read-only ledger integrity check with held-order allowlist"
```

---

### Task 7: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full test suite.** Run: `npm test`. Expected: all vitest suites pass (ledger-math + payment-defaults).
- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Manual checklist on localhost:5000** (Karan or dev):
  - Business-type client → Credit pre-filled; Bank/QR triggers warning; cancel reverts.
  - Consumer client → empty field, must choose, no warning.
  - N&H FY 2082/83 export → no cancelled rows, closing 522,135.36.
  - Account page → wholesale toggles persist.
  - `npm run integrity-check` → 0 new findings.
- [ ] **Step 4: Hand to Karan for localhost verification. Do NOT push** — `main` auto-deploys; Karan pushes (or approves push) after verifying.

---

## Post-implementation notes (2026-08-02)

Executed on branch `feat/payment-defaults-export-integrity` (8 commits, 2122ac0..6901a39). All task and
final reviews clean. Deferred follow-ups (non-blocking, from final whole-branch review):

- `isDataCustomer` naming aside: `isD2CCustomer` (customer-locations.tsx) still keys off the type NAME
  "consumer"; should be re-keyed off `!is_business` so the two business/consumer notions can't disagree.
- `useCustomerLedger` (use-customers.ts) is unpaginated → silently capped at ~1000 entries; the export's
  closing-balance promise breaks for customers past the cap. Copy the pagination pattern already used by
  `useCustomersWithAging`.
- Fiscal download button `disabled` uses unfiltered counts (cosmetic).
- `client/src/lib/database.types.ts` is corrupted generated output (pre-existing, unreferenced) — regenerate.
- Dialog reopen with the same customer pre-selected leaves payment status empty instead of re-deriving
  Credit (fails safe; convenience only).

Manual steps before push (main auto-deploys):
1. Run `supabase-customer-type-is-business.sql` in the Supabase SQL editor (now tenant-scoped).
2. Verify on localhost:5000: types card toggles; Gym-client order pre-fills Credit + Bank/QR warning
   (also via the inline new-customer form); Consumer order empty/no warning; N&H FY 2082/83 export
   closes at 522,135.36 with no cancelled rows; `npm run integrity-check` → 0 new / 28 held.
