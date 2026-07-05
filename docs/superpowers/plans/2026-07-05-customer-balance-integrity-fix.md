# Customer Balance Integrity Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `customers.current_balance` always agree with the ledger, fix the order-cancellation and payment-status-change bugs that corrupt it, and repair the existing corrupted data.

**Architecture:** Bikri 2.0 is a Vite + React SPA talking directly to Supabase (PostgREST) from client hooks; there is no server layer. Balance math is currently duplicated inline in 6 places with 3 different conventions. We extract the money-direction rules into one pure module (`client/src/lib/ledger-math.ts`), make every hook/page use it, fix the three broken mutations, and ship a one-time repair script (`script/repair-balances.ts`, run with `tsx`) that recomputes every customer's balance from the ledger.

**Tech Stack:** TypeScript, React Query mutations with inline `supabase-js` calls, Vitest (new dev dependency), `tsx` script runner (already used by `db:seed`).

## Background — the accounting model (read this first)

- All money values are **integers in cents/paisa**. Never use floats.
- `ledger_entries.amount` is **always positive**; `type` carries direction:
  - `purchase`, `debit`, `adjustment` → customer owes more (balance **up**)
  - `credit`, `payment` → customer owes less (balance **down**)
- Order creation writes ledger entries for **every** payment type:
  - Credit order → one `purchase` entry; `current_balance += total`
  - COD / Bank Transfer/QR order → `purchase` + auto `payment` entry (net 0); balance untouched
- The deployed `customer_aging` DB view (see `supabase-customer-aging-view.sql`) is the reference implementation of the convention: it treats `credit`+`payment` as reductions and **excludes all entries whose `order_id` belongs to a cancelled order**, on both sides.
- Therefore the invariant this plan enforces everywhere:

  ```
  current_balance == Σ amount(purchase|debit|adjustment) − Σ amount(credit|payment)
                     over entries NOT linked to a cancelled order
  ```

## The bugs being fixed

| # | Location | Bug | Effect |
|---|----------|-----|--------|
| A | `client/src/hooks/use-orders.ts` `useUpdateOrderStatus` (~lines 505–533) | Cancelling an order subtracts `total_amount` from `current_balance` for **all** payment types, but only Credit orders ever added it. It also inserts a reversal `credit` ledger entry for all types; for COD/Bank orders that entry double-reverses (the auto `payment` entry already offsets the purchase). | Cancelled COD/Bank orders silently reduce customer debt. Confirmed live: N&H Grocer understated by NPR 1,32,600 (order #2848); ~46 retail customers hold phantom negative balances (~−1,950 each). |
| B | `client/src/hooks/use-orders.ts` `useUpdateOrderStatus` + `client/src/pages/orders.tsx` bulk action bar (~line 510) | A cancelled order can be bulk-moved back to an active status. Stock, ledger, and balance side effects are **not** re-applied, and the aging view suddenly re-includes the order's purchase + reversal entries. | Un-cancelling corrupts stock counts, ledger, and aging simultaneously. |
| C | `client/src/hooks/use-orders.ts` `useUpdatePaymentStatus` (~lines 719–738) | Changing an order's payment status (Credit ↔ COD/Bank) updates only the `orders` row — no ledger entry, no balance change. | Credit→COD leaves debt on the books after the customer paid; COD→Credit hides real debt. |
| D | `client/src/pages/customers.tsx` lines 421 and 753; `client/src/hooks/use-customers.ts` line 304; `client/src/pages/customers.tsx` line 1086 | Three of the four manual balance-delta calculations treat only `type === 'credit'` as a reduction; `payment` entries are counted as **increases** (line 526 in the same file gets it right). | Ledger-tab opening balance and +/− display are wrong for customers with auto `payment` entries; a hypothetical manual `payment` entry would corrupt the balance. |
| E | Data | Historical damage from A: corrupted `current_balance` values and orphaned reversal `credit` entries on cancelled non-Credit orders. | Dashboard "Outstanding Credit" reads NPR 49,53,243.21; ledger truth is NPR 50,79,993.21. |

## Global Constraints

- Money is integer cents everywhere; no floats in arithmetic (display-only division is fine).
- `ledger_entries.amount` stays positive; direction lives in `type`.
- Match existing codebase idiom: inline `supabase` calls inside React Query mutations, read-modify-write balance updates (concurrency races are a pre-existing, accepted limitation — do NOT redesign to RPCs/triggers in this plan).
- Do not modify the database schema, RLS policies, or the `customer_aging` view.
- Payment status literals are exactly: `'COD'`, `'Bank Transfer/QR'`, `'Credit'`. Order status literal for cancellation is exactly `'cancelled'`.
- `npm run check` (tsc) must pass after every task.
- Work on the repo's current branch (`replit-agent`) at `C:\Users\Karan2\Desktop\All Cursor Projects\Bikri 2.0`.
- The repair script (Task 5/6) must only be **run with `--apply`** after Tasks 1–4 are deployed to wherever users run the app, and after Karan confirms. Dry-run is always safe.

---

### Task 1: Vitest + pure ledger-math module

**Files:**
- Create: `client/src/lib/ledger-math.ts`
- Create: `client/src/lib/ledger-math.test.ts`
- Modify: `package.json` (add vitest + test script)

**Interfaces:**
- Produces (consumed by Tasks 2–6):
  - `isBalanceReducing(type: string): boolean` — true for `'credit'` and `'payment'`
  - `ledgerBalanceDelta(type: string, amount: number): number` — signed cents delta
  - `cancellationEffects(paymentStatus: string, totalAmount: number): { balanceDelta: number; createReversalEntry: boolean }`
  - `paymentStatusChangeEffects(oldStatus: string, newStatus: string, totalAmount: number): { balanceDelta: number; ledgerAction: 'insert-payment' | 'delete-auto-payment' | 'none' }`
  - `computeCustomerBalance(entries: { type: string; amount: number; order_id: number | null }[], cancelledOrderIds: Set<number>): number`
  - `findOrphanReversalEntryIds(entries: { id: number; type: string; order_id: number | null }[], orders: { id: number; status: string; payment_status: string }[]): number[]`

- [ ] **Step 1: Install vitest and add test script**

```powershell
cd "C:\Users\Karan2\Desktop\All Cursor Projects\Bikri 2.0"; npm install -D vitest
```

In `package.json` `"scripts"`, add: `"test": "vitest run"`

- [ ] **Step 2: Write the failing tests**

Create `client/src/lib/ledger-math.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isBalanceReducing,
  ledgerBalanceDelta,
  cancellationEffects,
  paymentStatusChangeEffects,
  computeCustomerBalance,
  findOrphanReversalEntryIds,
} from './ledger-math';

describe('ledgerBalanceDelta', () => {
  it('purchase/debit/adjustment increase the balance', () => {
    expect(ledgerBalanceDelta('purchase', 1000)).toBe(1000);
    expect(ledgerBalanceDelta('debit', 1000)).toBe(1000);
    expect(ledgerBalanceDelta('adjustment', 1000)).toBe(1000);
  });
  it('credit AND payment decrease the balance', () => {
    expect(ledgerBalanceDelta('credit', 1000)).toBe(-1000);
    expect(ledgerBalanceDelta('payment', 1000)).toBe(-1000); // bug D regression test
  });
  it('negative adjustment amounts pass through (legacy -2 entry exists in prod)', () => {
    expect(ledgerBalanceDelta('adjustment', -2)).toBe(-2);
  });
  it('isBalanceReducing matches', () => {
    expect(isBalanceReducing('credit')).toBe(true);
    expect(isBalanceReducing('payment')).toBe(true);
    expect(isBalanceReducing('purchase')).toBe(false);
  });
});

describe('cancellationEffects', () => {
  it('Credit order: reverse balance and write reversal entry', () => {
    expect(cancellationEffects('Credit', 132600_00)).toEqual({
      balanceDelta: -132600_00,
      createReversalEntry: true,
    });
  });
  it('COD order: no balance change, no reversal entry (bug A regression test)', () => {
    expect(cancellationEffects('COD', 1950_00)).toEqual({
      balanceDelta: 0,
      createReversalEntry: false,
    });
  });
  it('Bank Transfer/QR order: no balance change, no reversal entry', () => {
    expect(cancellationEffects('Bank Transfer/QR', 132600_00)).toEqual({
      balanceDelta: 0,
      createReversalEntry: false,
    });
  });
});

describe('paymentStatusChangeEffects', () => {
  it('Credit -> COD: customer paid; insert payment entry, drop balance', () => {
    expect(paymentStatusChangeEffects('Credit', 'COD', 5000)).toEqual({
      balanceDelta: -5000,
      ledgerAction: 'insert-payment',
    });
  });
  it('Credit -> Bank Transfer/QR: same as COD', () => {
    expect(paymentStatusChangeEffects('Credit', 'Bank Transfer/QR', 5000)).toEqual({
      balanceDelta: -5000,
      ledgerAction: 'insert-payment',
    });
  });
  it('COD -> Credit: debt restored; remove auto payment entry, raise balance', () => {
    expect(paymentStatusChangeEffects('COD', 'Credit', 5000)).toEqual({
      balanceDelta: 5000,
      ledgerAction: 'delete-auto-payment',
    });
  });
  it('COD <-> Bank Transfer/QR: relabel only, no financial effect', () => {
    expect(paymentStatusChangeEffects('COD', 'Bank Transfer/QR', 5000)).toEqual({
      balanceDelta: 0,
      ledgerAction: 'none',
    });
  });
  it('same status: no effect', () => {
    expect(paymentStatusChangeEffects('Credit', 'Credit', 5000)).toEqual({
      balanceDelta: 0,
      ledgerAction: 'none',
    });
  });
});

describe('computeCustomerBalance', () => {
  it('active credit order minus a manual payment', () => {
    const entries = [
      { type: 'purchase', amount: 10000, order_id: 1 },
      { type: 'credit', amount: 4000, order_id: null },
    ];
    expect(computeCustomerBalance(entries, new Set())).toBe(6000);
  });
  it('COD order nets to zero', () => {
    const entries = [
      { type: 'purchase', amount: 10000, order_id: 2 },
      { type: 'payment', amount: 10000, order_id: 2 },
    ];
    expect(computeCustomerBalance(entries, new Set())).toBe(0);
  });
  it('entries linked to cancelled orders are excluded entirely', () => {
    const entries = [
      { type: 'purchase', amount: 10000, order_id: 3 }, // cancelled credit order
      { type: 'credit', amount: 10000, order_id: 3 },   // its reversal
      { type: 'purchase', amount: 7000, order_id: 4 },  // live credit order
    ];
    expect(computeCustomerBalance(entries, new Set([3]))).toBe(7000);
  });
  it('advance payment produces a legitimate negative balance', () => {
    const entries = [{ type: 'credit', amount: 5000, order_id: null }];
    expect(computeCustomerBalance(entries, new Set())).toBe(-5000);
  });
});

describe('findOrphanReversalEntryIds', () => {
  const orders = [
    { id: 10, status: 'cancelled', payment_status: 'COD' },
    { id: 11, status: 'cancelled', payment_status: 'Credit' },
    { id: 12, status: 'completed', payment_status: 'COD' },
  ];
  it('flags reversal credits on cancelled NON-Credit orders only', () => {
    const entries = [
      { id: 100, type: 'credit', order_id: 10 },  // orphan (COD cancellation reversal)
      { id: 101, type: 'credit', order_id: 11 },  // legit (Credit cancellation reversal)
      { id: 102, type: 'payment', order_id: 10 }, // auto payment, not a reversal
      { id: 103, type: 'credit', order_id: 12 },  // order not cancelled
      { id: 104, type: 'credit', order_id: null },// manual payment
    ];
    expect(findOrphanReversalEntryIds(entries, orders)).toEqual([100]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/ledger-math.test.ts`
Expected: FAIL — `Cannot find module './ledger-math'` (or equivalent resolve error).

- [ ] **Step 4: Write the implementation**

Create `client/src/lib/ledger-math.ts`:

```ts
// Single source of truth for how ledger entry types move a customer's balance.
// Mirrors the deployed customer_aging view (supabase-customer-aging-view.sql):
// purchase/debit/adjustment raise what the customer owes; credit/payment lower it;
// entries tied to a cancelled order are ignored entirely.

const BALANCE_REDUCING_TYPES = new Set(['credit', 'payment']);

export function isBalanceReducing(type: string): boolean {
  return BALANCE_REDUCING_TYPES.has(type);
}

export function ledgerBalanceDelta(type: string, amount: number): number {
  return isBalanceReducing(type) ? -amount : amount;
}

export function cancellationEffects(
  paymentStatus: string,
  totalAmount: number,
): { balanceDelta: number; createReversalEntry: boolean } {
  // Only Credit orders added to current_balance at creation, so only they
  // reverse it. COD/Bank orders carry purchase+payment entries that already
  // net to zero — a reversal entry would double-reverse them.
  if (paymentStatus === 'Credit') {
    return { balanceDelta: -totalAmount, createReversalEntry: true };
  }
  return { balanceDelta: 0, createReversalEntry: false };
}

export function paymentStatusChangeEffects(
  oldStatus: string,
  newStatus: string,
  totalAmount: number,
): { balanceDelta: number; ledgerAction: 'insert-payment' | 'delete-auto-payment' | 'none' } {
  const wasCredit = oldStatus === 'Credit';
  const isCredit = newStatus === 'Credit';
  if (wasCredit && !isCredit) {
    return { balanceDelta: -totalAmount, ledgerAction: 'insert-payment' };
  }
  if (!wasCredit && isCredit) {
    return { balanceDelta: totalAmount, ledgerAction: 'delete-auto-payment' };
  }
  return { balanceDelta: 0, ledgerAction: 'none' };
}

export function computeCustomerBalance(
  entries: { type: string; amount: number; order_id: number | null }[],
  cancelledOrderIds: Set<number>,
): number {
  return entries.reduce((sum, e) => {
    if (e.order_id !== null && cancelledOrderIds.has(e.order_id)) return sum;
    return sum + ledgerBalanceDelta(e.type, e.amount);
  }, 0);
}

export function findOrphanReversalEntryIds(
  entries: { id: number; type: string; order_id: number | null }[],
  orders: { id: number; status: string; payment_status: string }[],
): number[] {
  const cancelledNonCredit = new Set(
    orders
      .filter((o) => o.status === 'cancelled' && o.payment_status !== 'Credit')
      .map((o) => o.id),
  );
  return entries
    .filter(
      (e) =>
        e.type === 'credit' &&
        e.order_id !== null &&
        cancelledNonCredit.has(e.order_id),
    )
    .map((e) => e.id);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run client/src/lib/ledger-math.test.ts`
Expected: PASS (all suites).

- [ ] **Step 6: Type-check and commit**

```powershell
npm run check
git add package.json package-lock.json client/src/lib/ledger-math.ts client/src/lib/ledger-math.test.ts
git commit -m "feat: pure ledger-math module + vitest (balance convention single source of truth)"
```

---

### Task 2: Fix order cancellation (bug A) and block un-cancel (bug B)

**Files:**
- Modify: `client/src/hooks/use-orders.ts` — `useUpdateOrderStatus` (~lines 419–533)
- Modify: `client/src/pages/orders.tsx` — bulk action bar (~line 510)

**Interfaces:**
- Consumes: `cancellationEffects` from `client/src/lib/ledger-math` (Task 1).
- Produces: `useUpdateOrderStatus` mutation that throws `Error('Cancelled orders cannot be reactivated. Create a new order instead.')` on any cancelled→active transition (orders.tsx callers surface mutation errors via existing toast handling).

- [ ] **Step 1: Add the un-cancel guard**

In `client/src/hooks/use-orders.ts`, inside `useUpdateOrderStatus`'s `mutationFn`, directly after the order fetch (`if (orderFetchError) throw orderFetchError;`, ~line 427) and BEFORE the `orders.update({ status })` call, insert:

```ts
      // A cancelled order's stock/ledger/balance side effects were already
      // reversed; re-activating would need them re-applied. We don't support
      // that — recreate the order instead (see order #2848 -> #2850 pattern).
      if (order.status === 'cancelled' && status !== 'cancelled') {
        throw new Error('Cancelled orders cannot be reactivated. Create a new order instead.');
      }
```

- [ ] **Step 2: Make cancellation effects Credit-only**

In the same mutation, replace the reversal-entry block and balance block (currently ~lines 505–533):

```ts
        // Create reversal ledger entry (credit back) instead of deleting
        if (user?.businessId) {
          await supabase
            .from('ledger_entries')
            .insert({
              business_id: user.businessId,
              customer_id: order.customer_id,
              order_id: id,
              type: 'credit',
              amount: order.total_amount,
              description: `Order #${id} cancelled - reversed`,
              entry_date: new Date().toISOString(),
            });
        }

        // Reverse customer balance (for all payment types, since ledger entry is always created)
        const { data: customer } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', order.customer_id)
          .single();

        if (customer) {
          await supabase
            .from('customers')
            .update({ current_balance: customer.current_balance - order.total_amount })
            .eq('id', order.customer_id);
        }
```

with:

```ts
        const effects = cancellationEffects(order.payment_status, order.total_amount);

        // Reversal ledger entry only for Credit orders. COD/Bank orders already
        // hold purchase+payment entries that net to zero.
        if (effects.createReversalEntry && user?.businessId) {
          await supabase
            .from('ledger_entries')
            .insert({
              business_id: user.businessId,
              customer_id: order.customer_id,
              order_id: id,
              type: 'credit',
              amount: order.total_amount,
              description: `Order #${id} cancelled - reversed`,
              entry_date: new Date().toISOString(),
            });
        }

        if (effects.balanceDelta !== 0) {
          const { data: customer } = await supabase
            .from('customers')
            .select('current_balance')
            .eq('id', order.customer_id)
            .single();

          if (customer) {
            await supabase
              .from('customers')
              .update({ current_balance: customer.current_balance + effects.balanceDelta })
              .eq('id', order.customer_id);
          }
        }
```

Add the import at the top of `use-orders.ts`:

```ts
import { cancellationEffects } from '@/lib/ledger-math';
```

(Confirm the `@` alias against neighboring imports in the file; if the file uses relative imports, use `../lib/ledger-math`.)

- [ ] **Step 3: Hide the bulk "Move to..." bar on the Cancelled tab**

In `client/src/pages/orders.tsx` (~line 510), change:

```tsx
            {selectedOrders.size > 0 && (
```

to:

```tsx
            {selectedOrders.size > 0 && status.value !== 'cancelled' && (
```

(The mutation guard from Step 1 is the real protection; this just removes the dead-end UI. The bar's only other action, the destructive cancel button, is already hidden on that tab.)

- [ ] **Step 4: Verify**

Run: `npm run check` — expected: no errors.
Run: `npx vitest run` — expected: PASS (Task 1 tests still green).

Manual spot-check (optional but recommended if dev server available): `npm run dev`, cancel a test COD order in a throwaway customer, confirm customer balance is unchanged and no `credit` ledger entry appears; cancel a test Credit order, confirm balance drops by the total and reversal entry appears; try bulk-moving from the Cancelled tab — bar should be gone.

- [ ] **Step 5: Commit**

```powershell
git add client/src/hooks/use-orders.ts client/src/pages/orders.tsx
git commit -m "fix: cancellation reverses balance/ledger only for Credit orders; block un-cancel"
```

---

### Task 3: Make payment-status changes adjust ledger and balance (bug C)

**Files:**
- Modify: `client/src/hooks/use-orders.ts` — `useUpdatePaymentStatus` (~lines 719–738)

**Interfaces:**
- Consumes: `paymentStatusChangeEffects` from `client/src/lib/ledger-math`.
- Produces: same mutation signature `({ id, paymentStatus })`; now also throws `Error('Cannot change payment status of a cancelled order.')`.

- [ ] **Step 1: Replace the mutation**

Replace the whole `useUpdatePaymentStatus` function with:

```ts
export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, paymentStatus }: { id: number; paymentStatus: string }) => {
      const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('customer_id, total_amount, payment_status, status')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      if (order.status === 'cancelled') {
        throw new Error('Cannot change payment status of a cancelled order.');
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ payment_status: paymentStatus })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const effects = paymentStatusChangeEffects(
        order.payment_status,
        paymentStatus,
        order.total_amount,
      );

      if (effects.ledgerAction === 'insert-payment' && user?.businessId) {
        // Order was Credit, is now paid: record the payment.
        await supabase
          .from('ledger_entries')
          .insert({
            business_id: user.businessId,
            customer_id: order.customer_id,
            order_id: id,
            type: 'payment',
            amount: order.total_amount,
            description: `Payment received - Order #${id} (${paymentStatus})`,
            entry_date: new Date().toISOString(),
          });
      } else if (effects.ledgerAction === 'delete-auto-payment') {
        // Order was COD/Bank, is now Credit: remove the auto payment entry
        // created at order time. Manual payments have order_id NULL and are
        // never touched by this. Older orders may lack the entry — that's fine.
        await supabase
          .from('ledger_entries')
          .delete()
          .eq('order_id', id)
          .eq('type', 'payment');
      }

      if (effects.balanceDelta !== 0) {
        const { data: customer } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', order.customer_id)
          .single();

        if (customer) {
          await supabase
            .from('customers')
            .update({ current_balance: customer.current_balance + effects.balanceDelta })
            .eq('id', order.customer_id);
        }
      }

      return data as Order;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger', data.customer_id] });
    },
  });
}
```

Extend the import from Task 2:

```ts
import { cancellationEffects, paymentStatusChangeEffects } from '@/lib/ledger-math';
```

Note the `useAuth()` hook addition at the top of the function — copy the exact pattern from `useUpdateOrderStatus` in the same file.

Known operator caveat (document, don't code): if a payment was already recorded manually against the customer and the operator *then* flips the order Credit→COD, the customer gets credited twice. That's an operator workflow question, not something the code can distinguish.

- [ ] **Step 2: Verify**

Run: `npm run check` — expected: no errors.
Run: `npx vitest run` — expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add client/src/hooks/use-orders.ts
git commit -m "fix: payment-status changes now write payment ledger entries and adjust balance"
```

---

### Task 4: Unify the four manual balance-delta spots (bug D)

**Files:**
- Modify: `client/src/hooks/use-customers.ts` (~line 304)
- Modify: `client/src/pages/customers.tsx` (~lines 421, 526, 753, 1086)

**Interfaces:**
- Consumes: `ledgerBalanceDelta`, `isBalanceReducing` from `client/src/lib/ledger-math`.

- [ ] **Step 1: `use-customers.ts` manual ledger entry**

Replace (~line 304):

```ts
      const balanceChange = entry.type === 'credit' ? -entry.amount : entry.amount;
```

with:

```ts
      const balanceChange = ledgerBalanceDelta(entry.type, entry.amount);
```

Add import: `import { ledgerBalanceDelta } from '@/lib/ledger-math';`

- [ ] **Step 2: `customers.tsx` CSV ledger import**

Replace (~line 1086):

```ts
          const balanceChange = type === 'credit' ? -amount : amount;
```

with:

```ts
          const balanceChange = ledgerBalanceDelta(type, amount);
```

(The import's `validTypes = ['credit', 'adjustment']` stays as is — this change is defensive consistency, not a behavior change for currently-valid CSV types.)

- [ ] **Step 3: `customers.tsx` fiscal-year opening balance**

Replace (~lines 420–423):

```ts
        if (entryDate < startDate) {
          if (entry.type === 'credit') return sum - entry.amount;
          return sum + entry.amount;
        }
```

with:

```ts
        if (entryDate < startDate) {
          return sum + ledgerBalanceDelta(entry.type!, entry.amount);
        }
```

- [ ] **Step 4: `customers.tsx` ledger row sign display**

Line ~526 already computes `const isCredit = entry.type === 'credit' || entry.type === 'payment';` — replace that expression with `isBalanceReducing(entry.type!)` for consistency, and at (~line 751–753) replace:

```tsx
                          entry.type === 'credit' ? "text-green-600" : "text-foreground"
                        )}>
                          {entry.type === 'credit' ? "-" : "+"}{formatCurrency(entry.amount)}
```

with:

```tsx
                          isBalanceReducing(entry.type!) ? "text-green-600" : "text-foreground"
                        )}>
                          {isBalanceReducing(entry.type!) ? "-" : "+"}{formatCurrency(entry.amount)}
```

(If line 751's scope doesn't have `isBalanceReducing` imported yet, add it to the `customers.tsx` import from Step 2: `import { ledgerBalanceDelta, isBalanceReducing } from '@/lib/ledger-math';`. If `entry.type` is typed non-nullable, drop the `!`.)

- [ ] **Step 5: Verify and commit**

Run: `npm run check` — expected: no errors.
Run: `npx vitest run` — expected: PASS.

```powershell
git add client/src/hooks/use-customers.ts client/src/pages/customers.tsx
git commit -m "fix: treat payment entries as balance-reducing in all manual paths and displays"
```

---

### Task 5: One-time repair script (dry-run)

**Files:**
- Create: `script/repair-balances.ts`

**Interfaces:**
- Consumes: `computeCustomerBalance`, `findOrphanReversalEntryIds` from `client/src/lib/ledger-math` (imported via relative path `../client/src/lib/ledger-math`).
- Produces: CLI — `npx tsx script/repair-balances.ts` (dry-run, read-only) and `npx tsx script/repair-balances.ts --apply` (writes). Prints per-customer diff and writes `script/repair-balances-report.csv`.

**What it repairs (bug E), for ALL businesses in the database:**
1. Deletes orphaned reversal `credit` entries attached to cancelled **non-Credit** orders (these double-reverse; created by bug A).
2. Recomputes every customer's `current_balance` from the ledger per the invariant (excluding entries linked to cancelled orders) and updates rows that differ.
3. Verifies afterwards that `Σ max(current_balance, 0)` equals the `customer_aging` view's `Σ total_unpaid` per business.

- [ ] **Step 1: Write the script**

Create `script/repair-balances.ts`:

```ts
// One-time repair for customer balances corrupted by the cancel-order bug.
// Dry-run by default; pass --apply to write. Idempotent: re-running after
// apply reports zero drift. Requires .env with SUPABASE_SERVICE_ROLE_KEY.
//
//   npx tsx script/repair-balances.ts
//   npx tsx script/repair-balances.ts --apply

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeCustomerBalance, findOrphanReversalEntryIds } from '../client/src/lib/ledger-math';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
const APPLY = process.argv.includes('--apply');

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
    rows.push(...(data as T[]));
    if (!data || data.length < page) return rows;
  }
}

type OrderRow = { id: number; status: string; payment_status: string };
type EntryRow = { id: number; customer_id: number; type: string; amount: number; order_id: number | null };
type CustomerRow = { id: number; business_id: string; name: string; current_balance: number };
type BusinessRow = { id: string; name: string };

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (read-only)'}`);

  const businesses = await fetchAll<BusinessRow>('businesses', 'id,name');
  const orders = await fetchAll<OrderRow>('orders', 'id,status,payment_status');
  const entries = await fetchAll<EntryRow>('ledger_entries', 'id,customer_id,type,amount,order_id');
  const customers = await fetchAll<CustomerRow>('customers', 'id,business_id,name,current_balance');

  // 1. Orphaned reversal credits on cancelled non-Credit orders.
  const orphanIds = new Set(findOrphanReversalEntryIds(entries, orders));
  console.log(`\nOrphaned reversal entries to delete: ${orphanIds.size}`);

  // 2. Recompute balances from the ledger, pretending orphans are gone.
  const cancelledIds = new Set(orders.filter((o) => o.status === 'cancelled').map((o) => o.id));
  const byCustomer = new Map<number, EntryRow[]>();
  for (const e of entries) {
    if (orphanIds.has(e.id)) continue;
    const list = byCustomer.get(e.customer_id) ?? [];
    list.push(e);
    byCustomer.set(e.customer_id, list);
  }

  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const changes: { customer: CustomerRow; computed: number }[] = [];
  for (const c of customers) {
    const computed = computeCustomerBalance(byCustomer.get(c.id) ?? [], cancelledIds);
    if (computed !== c.current_balance) changes.push({ customer: c, computed });
  }

  console.log(`Customers needing balance repair: ${changes.length} of ${customers.length}\n`);
  const csv = ['business,customer_id,customer_name,stored_balance,computed_balance,delta'];
  for (const { customer: c, computed } of changes) {
    const delta = computed - c.current_balance;
    csv.push(`"${bizName.get(c.business_id)}",${c.id},"${c.name.replace(/"/g, '""')}",${c.current_balance},${computed},${delta}`);
    console.log(
      `  [${bizName.get(c.business_id)}] #${c.id} ${c.name}: ` +
      `${(c.current_balance / 100).toFixed(2)} -> ${(computed / 100).toFixed(2)} ` +
      `(${delta > 0 ? '+' : ''}${(delta / 100).toFixed(2)})`,
    );
  }
  writeFileSync(resolve(ROOT, 'script/repair-balances-report.csv'), csv.join('\n'));
  console.log('\nReport written to script/repair-balances-report.csv');

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to write.');
    return;
  }

  // 3. Apply: delete orphans, then update balances.
  for (const id of orphanIds) {
    const { error } = await supabase.from('ledger_entries').delete().eq('id', id);
    if (error) throw new Error(`delete entry ${id}: ${error.message}`);
  }
  console.log(`Deleted ${orphanIds.size} orphaned reversal entries.`);

  for (const { customer: c, computed } of changes) {
    const { error } = await supabase
      .from('customers')
      .update({ current_balance: computed })
      .eq('id', c.id);
    if (error) throw new Error(`update customer ${c.id}: ${error.message}`);
  }
  console.log(`Updated ${changes.length} customer balances.`);

  // 4. Verify: dashboard-style sum must now equal the aging view, per business.
  const freshCustomers = await fetchAll<CustomerRow>('customers', 'id,business_id,name,current_balance');
  const aging = await fetchAll<{ id: number; business_id: string; total_unpaid: number }>(
    'customer_aging', 'id,business_id,total_unpaid',
  );
  for (const b of businesses) {
    const dash = freshCustomers
      .filter((c) => c.business_id === b.id && c.current_balance > 0)
      .reduce((s, c) => s + c.current_balance, 0);
    const view = aging
      .filter((a) => a.business_id === b.id)
      .reduce((s, a) => s + a.total_unpaid, 0);
    const ok = dash === view ? 'OK' : 'MISMATCH';
    console.log(`${ok}  ${b.name}: dashboard=${(dash / 100).toFixed(2)} view=${(view / 100).toFixed(2)}`);
    if (dash !== view) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the dry-run against live data**

Run: `npx tsx script/repair-balances.ts`
Expected output shape:
- `Orphaned reversal entries to delete:` — roughly 45–50 (one per cancelled COD/Bank order that went through the buggy cancel path; there are 58 cancelled orders total, of which the non-Credit ones with reversal entries qualify).
- `Customers needing balance repair:` — roughly 48 (N&H Grocer plus ~46 phantom-negative retail customers, plus any residual drift like N&H's 5,850).
- N&H Grocer Pvt. Ltd line reading `445,110.36 -> 571,860.36 (+126,750.00)`.
- Retail rows like `-1,950.00 -> 0.00 (+1,950.00)`.

Sanity-check the report CSV: every delta on a phantom-negative retail customer should exactly equal their cancelled COD order total. If the dry run shows anything surprising (deltas on Beauty Cart / khol.np you can't trace to this bug family, or thousands of rows), STOP and investigate before applying.

- [ ] **Step 3: Verify and commit (script only — no data written yet)**

Run: `npm run check` — expected: no errors (script is type-checked too since tsc covers the repo; if `tsconfig.json` excludes `script/`, run `npx tsc --noEmit script/repair-balances.ts` instead).

```powershell
git add script/repair-balances.ts
git commit -m "feat: one-time balance repair script (dry-run by default)"
```

---

### Task 6: Deploy fixes, then apply the repair

Order matters: if the repair runs while users still have the buggy client open, a new cancellation can re-corrupt a balance immediately.

- [ ] **Step 1: Deploy the fixed client** the way Bikri is normally shipped (Replit/hosted build — confirm with Karan which deployment applies). All users must be on the fixed build before Step 3.

- [ ] **Step 2: Get Karan's explicit go-ahead** — show him the dry-run diff from Task 5 Step 2. This writes to production data.

- [ ] **Step 3: Apply**

Run: `npx tsx script/repair-balances.ts --apply`
Expected: deletions + updates logged, then per-business verification lines all reading `OK`, exit code 0. For Prime Nutrition specifically: `dashboard=5,079,993.21 view=5,079,993.21` (value will drift with new sales between now and run time — the two numbers matching each other is the check, not the absolute value).

- [ ] **Step 4: Re-run dry-run to confirm idempotence/convergence**

Run: `npx tsx script/repair-balances.ts`
Expected: `Orphaned reversal entries to delete: 0`, `Customers needing balance repair: 0`.

- [ ] **Step 5: Eyeball the app** — dashboard "Outstanding Credit" now matches the customers page aging totals; N&H Grocer shows ~5,71,860.36 (plus any new activity); the ~46 retail customers show 0 balance.

- [ ] **Step 6: Commit the report artifact** (optional, if Karan wants the audit trail in-repo)

```powershell
git add script/repair-balances-report.csv
git commit -m "chore: balance repair audit report (pre-apply snapshot)"
```

---

## Edge-case coverage matrix

| Scenario | Handled by | Behavior after fix |
|---|---|---|
| Cancel a Credit order | Task 2 | Balance −= total; reversal `credit` entry written (unchanged, was already correct) |
| Cancel a COD or Bank Transfer/QR order | Task 2 | No balance change, no reversal entry (purchase+payment already net 0) |
| Cancel an already-cancelled order | pre-existing guard (`order.status !== 'cancelled'`), kept | No-op |
| Un-cancel (cancelled → new/in-process/ready/completed), single or bulk | Task 2 | Mutation throws; bulk bar hidden on Cancelled tab |
| Delete an active Credit order | pre-existing code, unchanged | Balance −= total; ledger entries deleted |
| Delete an active COD/Bank order | pre-existing code, unchanged | No balance change; entries deleted |
| Delete an already-cancelled order | pre-existing guard (`status !== 'cancelled'`), unchanged | No double reversal |
| Change payment status Credit → COD/Bank | Task 3 | `payment` entry inserted; balance −= total |
| Change payment status COD/Bank → Credit | Task 3 | Auto `payment` entry deleted (order-linked only; manual entries have `order_id NULL`); balance += total; tolerant of a missing entry on legacy orders |
| Change payment status COD ↔ Bank | Task 3 | Relabel only; no financial effect |
| Change payment status on a cancelled order | Task 3 | Mutation throws |
| Change payment status to the same value | Task 3 (`paymentStatusChangeEffects` returns `none`) | Relabel no-op |
| Manual ledger entry / CSV import of type `payment` | Task 4 | Treated as balance-reducing everywhere (was: increased balance) |
| CSV import types other than `credit`/`adjustment`, or amount ≤ 0 | pre-existing validation (`validTypes`, amount > 0), unchanged | Rejected per-row |
| Legacy negative-amount `adjustment` (the −2 entry in prod) | Task 1 (`ledgerBalanceDelta` passes sign through), Task 5 | Preserved; repair math handles it |
| Customer with genuine advance payment (negative balance) | Task 5 | Recomputed faithfully; stays negative; dashboard still sums only positive balances (unchanged display semantics) |
| Orphaned reversal `credit` entries from historical COD/Bank cancellations | Task 5 | Deleted (they double-reverse); Credit-order reversals are kept |
| Ledger entries on deleted orders | n/a | Delete flow removes the entries with the order — nothing to repair |
| Fiscal-year opening balance in the customer ledger dialog | Task 4 | `payment` entries now subtract; cancelled Credit pairs and COD purchase+payment pairs each net 0, so raw-sum display stays consistent post-repair |
| Repair runs twice / crashes midway | Task 5 idempotence | Re-run converges to zero-diff; deletions and updates are individually safe to repeat |
| PostgREST pagination duplicates (the bug that produced the wrong 77.98L Excel figure) | Task 5 `fetchAll` | All fetches sorted by `id` with range pagination |
| Other businesses in the same database (khol.np, Beauty Cart) | Task 5 | Repaired and verified per business |

## Known, accepted limitations (out of scope — do not fix in this plan)

- **Read-modify-write races:** two operators mutating the same customer concurrently can lose an update. Pre-existing across the whole app; the durable fix is moving balance math into Postgres triggers/RPCs. Not now (YAGNI).
- **Multi-step mutations aren't transactional:** a crash between the ledger insert and the balance update leaves drift. The repair script doubles as the recovery tool; re-run it if drift is ever suspected.
- **Manual-payment-then-flip-to-COD double credit:** operator workflow issue (see Task 3 caveat).
- **Dashboard sums only positive balances:** unchanged display semantics; genuine advances are invisible in the headline number, as today.
