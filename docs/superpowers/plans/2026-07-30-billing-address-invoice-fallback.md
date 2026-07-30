# Billing Address Invoice Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro forma invoice prints `billing_address` (falling back to `address`), printing both labelled lines when they differ.

**Architecture:** A pure helper `resolveInvoiceAddresses(customer)` in a new `client/src/lib/invoice-address.ts` decides which address line(s) to render; `proforma-invoice.ts` consumes it inside the existing "Bill To" block. Unit tests via vitest, matching the pattern of `usual-discount.test.ts`.

**Tech Stack:** TypeScript, vitest 4 (`npm test` = `vitest run`).

**Spec:** `docs/superpowers/specs/2026-07-30-billing-address-invoice-fallback-design.md`

## Global Constraints

- No schema change, no hook change, no data backfill.
- Labels are exactly `Billing Address:` and `Shipping Address:` (spec, revised 2026-07-30).
- Whitespace-only values count as blank; comparison is trim-equality, nothing fancier.
- tsc baseline has 10 pre-existing errors (`npm run check` exits 1) — gate on **no NEW errors**, do not try to fix the baseline.
- Never run bare `tsc` on individual files (emits stray `.js` that vitest picks up).
- Commit to `main` but **do NOT push** — Karan verifies on localhost:5000 first; main auto-deploys on push.

---

### Task 1: `resolveInvoiceAddresses` helper + tests

**Files:**
- Create: `client/src/lib/invoice-address.ts`
- Test: `client/src/lib/invoice-address.test.ts`

**Interfaces:**
- Produces: `resolveInvoiceAddresses(customer?: { address?: string | null; billing_address?: string | null }): { billing: string; shipping: string } | { single: string } | null`
  - `null` → render nothing (both blank / no customer)
  - `{ single }` → one unlabelled line (today's look)
  - `{ billing, shipping }` → two labelled lines (values are trimmed)

- [ ] **Step 1: Write the failing tests**

```typescript
// client/src/lib/invoice-address.test.ts
import { describe, it, expect } from 'vitest';
import { resolveInvoiceAddresses } from './invoice-address';

describe('resolveInvoiceAddresses', () => {
  it('no customer or both blank → null', () => {
    expect(resolveInvoiceAddresses(undefined)).toBeNull();
    expect(resolveInvoiceAddresses({})).toBeNull();
    expect(resolveInvoiceAddresses({ address: null, billing_address: null })).toBeNull();
    expect(resolveInvoiceAddresses({ address: '  ', billing_address: '' })).toBeNull();
  });

  it('billing blank → single line with address (fallback)', () => {
    expect(resolveInvoiceAddresses({ address: 'Balaju, KTM', billing_address: null }))
      .toEqual({ single: 'Balaju, KTM' });
    expect(resolveInvoiceAddresses({ address: 'Balaju, KTM', billing_address: '   ' }))
      .toEqual({ single: 'Balaju, KTM' });
  });

  it('billing equals address (trim-equality) → single line', () => {
    expect(resolveInvoiceAddresses({ address: ' Naxal, KTM ', billing_address: 'Naxal, KTM' }))
      .toEqual({ single: 'Naxal, KTM' });
  });

  it('billing differs → both, labelled by caller', () => {
    expect(resolveInvoiceAddresses({ address: 'Warehouse, Balaju', billing_address: 'Head Office, Naxal' }))
      .toEqual({ billing: 'Head Office, Naxal', shipping: 'Warehouse, Balaju' });
  });

  it('billing set, address blank → single line with billing', () => {
    expect(resolveInvoiceAddresses({ address: '', billing_address: 'Head Office, Naxal' }))
      .toEqual({ single: 'Head Office, Naxal' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- invoice-address` (from repo root)
Expected: FAIL — cannot resolve `./invoice-address`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/lib/invoice-address.ts
// Decides which address line(s) the pro forma invoice prints.
// Spec: docs/superpowers/specs/2026-07-30-billing-address-invoice-fallback-design.md
// billing_address = registered/invoice address; address = courier/delivery text.

export type InvoiceAddresses =
  | { billing: string; shipping: string }
  | { single: string }
  | null;

export function resolveInvoiceAddresses(
  customer?: { address?: string | null; billing_address?: string | null }
): InvoiceAddresses {
  const shipping = (customer?.address ?? '').trim();
  const billing = (customer?.billing_address ?? '').trim();

  if (!billing && !shipping) return null;
  if (!billing) return { single: shipping };
  if (!shipping || billing === shipping) return { single: billing };
  return { billing, shipping };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- invoice-address`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/invoice-address.ts client/src/lib/invoice-address.test.ts
git commit -m "feat: resolveInvoiceAddresses helper (billing fallback + differ case)"
```

---

### Task 2: Wire the helper into the pro forma template

**Files:**
- Modify: `client/src/lib/proforma-invoice.ts` (type block ~line 16, Bill To block ~line 130)

**Interfaces:**
- Consumes: `resolveInvoiceAddresses` from `./invoice-address` (Task 1)

- [ ] **Step 1: Add `billing_address` to the customer type**

In the `ProFormaOrder` type, after `address?: string | null;` (line 16):

```typescript
    address?: string | null;
    billing_address?: string | null;
```

(The call site at `client/src/pages/orders.tsx:818` passes orders fetched with `customer:customers(*)`, so the field is already present at runtime — no call-site change.)

- [ ] **Step 2: Import the helper**

At the top of `proforma-invoice.ts`:

```typescript
import { resolveInvoiceAddresses } from './invoice-address';
```

- [ ] **Step 3: Replace the address line in the Bill To block**

Before the template literal is built (near where `orderDate`/`businessName` are prepared), add:

```typescript
  const addr = resolveInvoiceAddresses(order.customer);
  const addressHtml = !addr
    ? ''
    : 'single' in addr
      ? `<div>${esc(addr.single)}</div>`
      : `<div><strong>Billing Address:</strong> ${esc(addr.billing)}</div>` +
        `<div><strong>Shipping Address:</strong> ${esc(addr.shipping)}</div>`;
```

Then replace line 130:

```typescript
    ${order.customer?.address ? `<div>${esc(order.customer.address)}</div>` : ''}
```

with:

```typescript
    ${addressHtml}
```

- [ ] **Step 4: Type-check — no NEW errors**

Run: `npm run check`
Expected: exits 1 with the same 10 pre-existing errors, none mentioning `invoice-address` or `proforma-invoice`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all suites PASS (including the 5 new tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/proforma-invoice.ts
git commit -m "feat: pro forma prints billing address with fallback to shipping address"
```

---

### Task 3: Karan's localhost verification (gate before push)

**Files:** none — manual gate.

- [ ] **Step 1: Start the dev server** (`npm run dev`, localhost:5000) and hand off to Karan:
  1. Set a distinct `billing_address` on one test customer (Info tab), open a pro forma for one of their orders → both labelled lines print.
  2. Open a pro forma for a customer with no billing address → output unchanged from before.
- [ ] **Step 2: Only after Karan confirms:** `git push` (main auto-deploys on Vercel).
