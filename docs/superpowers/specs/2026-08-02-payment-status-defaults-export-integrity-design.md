# Payment-Status Defaults, Cancelled-Order Export Exclusion, Integrity Check

**Date:** 2026-08-02
**Status:** Approved (Karan, 2026-08-02)

## Background

The 2026-08-02 ledger review (N&H Grocer FY 2082/83 export) surfaced three problems:

1. Two wholesale orders (#1859, #2848) were entered as Bank Transfer/QR, which auto-books a
   "Payment received" ledger entry at creation. Wholesale clients never pay by Bank/QR at order
   time — they are credit clients who settle later by transfer or cheque. These were data-entry
   mistakes the UI made easy.
2. The ledger export includes cancelled orders' entry pairs while the app's balance convention
   (ledger-math / customer_aging) excludes them, so export closings can disagree with stored
   balances. A pre-2026-07-16 edit bug also left one cancelled pair unbalanced (#1769, since
   corrected in data).
3. Both #1769 and #2539 were found by manual eyeballing of an export. There is no systematic
   check that ledger entries agree with their orders.

Corrections already applied directly in data (2026-08-02): LE#4944 → 73,125.00 with Divine
Protein balance matched; LE#3419 → 66,300.00. Fourteen COD/Bank orders with stale-but-netting
entries are **on hold** pending Karan's check against physical VAT bills.

## Design

### 1. `is_business` flag on customer types

- New boolean column `is_business` on `customer_types`, `NOT NULL DEFAULT false`.
- Checkbox in the existing customer-type management UI.
- One-time config after deploy: tick Gym, Retail, Pharmacy (Hydralyte business). Consumer stays
  false. No customer or order rows are modified.
- Types are per-business and free-form, so behavior keys off this flag — never off type names.

### 2. Payment-status default in the new-order dialog (new orders only)

- Selected customer's type has `is_business = true` → payment status pre-fills **Credit**.
- Otherwise (Consumer type, or customer has no type) → the field starts **empty** with
  placeholder "Select payment status…". The form does not submit until a status is chosen.
- Changing the selected customer mid-flow re-derives the default, but never overwrites a value
  the user has already explicitly chosen in this dialog session.
- Order edit flows, payment-status change flow, and all stored data: untouched. No backfill.

### 3. Soft warning for business clients on COD / Bank Transfer/QR

- Trigger: selected customer's type is business AND user selects COD or Bank Transfer/QR.
- Inline confirm (AlertDialog, consistent with existing confirms):
  "«Client name» is a wholesale client — this will mark the order as already paid and record
  the payment in their ledger. Continue?"
- Confirm keeps the selection; cancel reverts the field to its previous value.
- No warning for non-business customers. Warning fires on selection, not on submit.

### 4. Ledger export excludes cancelled orders

- `downloadLedgerXLSX` (customers.tsx) filters out ledger entries whose `order_id` belongs to a
  cancelled order, in both the exported rows and the opening-balance computation. Requires the
  customer's order statuses alongside the ledger (single extra query or join).
- Applies to both fiscal-year and all-time exports. Export closing then always equals the app's
  balance convention (ledger-math `computeCustomerBalance`).
- Audit visibility deliberately moves to the integrity check (below) — cancelled orders remain
  fully visible in the in-app ledger dialog; only client-facing exports omit them.

### 5. `script/integrity-check.ts` (read-only)

Modeled on `script/repair-balances.ts` fetch pattern (service role, paginated, stable ordering).
Never writes. Checks:

1. **Active orders:** the `purchase` entry amount equals `orders.total_amount`; for COD and
   Bank Transfer/QR orders the auto `payment` entry equals it too.
2. **Cancelled orders:** ledger debits equal credits (pair nets to zero).
3. **Balances:** every customer's `current_balance` equals the ledger-computed balance
   (skipping cancelled orders' entries, per ledger-math convention).

Output: per-finding lines grouped by check, summary counts, exit code 1 if any findings.
The 14 held COD/Bank orders will appear in check 1 until resolved; the script prints them under
a "known/held (VAT verification pending, 2026-08-02)" annotation via a hardcoded allowlist of
order IDs so new findings stand out. Removing IDs from the allowlist is part of resolving them.

## Out of scope

- Backfill or correction of any historical orders/entries (the 14 held orders are a separate,
  pending decision).
- Per-client payment-terms override field.
- A "payment pending confirmation" state — the Credit default plus soft warning covers the
  wholesale workflow without new states.

## Testing

- ledger-math stays untouched; new pure helpers (default derivation, warning predicate) get
  vitest coverage alongside `ledger-math.test.ts`.
- Manual: new order for a Gym-type client (pre-filled Credit; warning on Bank/QR), for a
  Consumer client (empty, must choose, no warning), export for N&H (closing 522,135.36 for
  FY 2082/83; cancelled rows absent), integrity check run (only the 14 held findings, annotated).
