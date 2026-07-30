# Bikri 2.0 — Billing Address on Pro Forma Invoice (Fallback) — Design

**Date:** 2026-07-30 · **Status:** Approved by Karan (chat, session of 2026-07-30)
Completes the `billing_address` column added 2026-07-29 (`supabase-add-billing-address.sql`),
whose migration comment already prescribed this behavior.

## Problem

`customers.billing_address` is capturable in the UI (both create dialogs + Info tab
edit) but consumed by nothing: 0 of 2,664 customers have it set, and the pro forma
invoice (`client/src/lib/proforma-invoice.ts:130`) prints only `customer.address`
(the courier/delivery text). For the handful of B2B accounts whose registered
invoice address differs from the delivery point, the printed bill shows the wrong
address.

## Decision

**Fallback logic, no data migration.**

- Invoice prints `billing_address`; when NULL/blank, falls back to `address`.
- No bulk copy of `address` → `billing_address`. Copying would freeze 2,664
  snapshots that silently go stale when a customer's address is later edited.
  The addresses are identical for all but a handful of B2B accounts; those get
  hand-filled after the template ships.
- `pan_vat_number` already prints (line 132) — out of scope, no change.

## Template behavior

In the customer block of the pro forma:

1. **Billing address differs** (billing set, and trimmed value ≠ trimmed `address`):
   print both, labelled — `Billing Address: <billing_address>` and
   `Shipping Address: <address>` — so the courier line never disappears from
   bills that previously carried it.
2. **Billing set and equal to address:** print it once, unlabelled (current look).
3. **Billing blank:** print `address` once, unlabelled (exactly today's output).

Whitespace-only billing values count as blank. Comparison is trim-equality only —
no normalization beyond that (YAGNI; entered by the same team in the same style).

## Scope

- One file: `client/src/lib/proforma-invoice.ts` (the only print/invoice template
  in the repo). The template's customer type (line 16) lacks `billing_address` —
  add it, and verify the call site passes a customer object that carries it.
- No schema change, no hook change, no backfill SQL.

## Testing / verification

- No vitest coverage exists for the template (it builds an HTML string for a print
  window); add a small pure helper `resolveInvoiceAddresses(customer)` returning
  `{ billing?: string; shipTo?: string; single?: string }` and unit-test the three
  cases plus whitespace-blank in vitest. Template consumes the helper.
- Karan verifies on localhost:5000: one customer with a distinct billing address
  (both lines print), one without (unchanged output), then push (main auto-deploys).

## Follow-up (not in scope)

Hand-fill `billing_address` for the known B2B exceptions (Bhatbhateni-style head
office vs. warehouse) once deployed.
