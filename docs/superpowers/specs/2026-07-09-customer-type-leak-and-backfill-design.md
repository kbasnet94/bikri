# Customer Type: Stop the Uncategorized Leak + Enable Backfill

**Date:** 2026-07-09
**Status:** Approved

## Problem

The dashboard's "Uncategorized" customer-type bucket grows every month. Root cause chain:

1. `customer_type_id` is nullable with `DEFAULT NULL`; all three creation flows (Add Customer dialog, inline "Create & Select" in orders, CSV bulk upload) allow saving without a type.
2. The type selector is hidden entirely when no types exist, so early customers could never be typed.
3. There is no update path for customers — once created untyped, a customer can never be reclassified. The bucket only grows.
4. CSV import silently nulls blank/unmatched `customerType` values.

## Decisions

| Question | Decision |
|---|---|
| Create-flow behavior | **Required field** in all creation flows (when ≥1 type exists) |
| Backfill UX | **Quick-set + bulk assign** ("Categorize" mode, not always-on checkboxes) |
| CSV unmatched/blank type | **Import as uncategorized, with visible warning** (stays lenient) |

## Design

### 1. Required type on create

- **Add Customer dialog** (`client/src/pages/customers.tsx`, `CreateCustomerDialog`): when `customerTypes.length > 0`, remove the "None" option and block save with inline error "Customer type is required" until a type is picked.
- **Inline order create** (`client/src/pages/orders.tsx`, "Create & Select" flow): same rule.
- **Edge case:** if a business has zero types defined, the field stays hidden and creation proceeds untyped (unchanged from today). Cannot require a pick from an empty list.

### 2. Quick-set (single customer)

- New mutation `useUpdateCustomerType(customerId, typeId)` in `client/src/hooks/use-customers.ts`: `update customers set customer_type_id = ? where id = ?`. On success: toast + invalidate `['customers']` and `['customers', 'type-map']` so the dashboard charts update.
- Customers table gains a **Type column** rendering a compact inline select per row (shows current type; distinct "Uncategorized" styling when null). Changing it saves immediately.
- The same selector appears in the `CustomerDetailsDialog` header.

### 3. Bulk assign ("Categorize" mode)

- Type **filter dropdown** above the customers table: All / each type / Uncategorized.
- When a filter is active, a "Select" toggle enables per-row checkboxes + select-all, and an action bar appears: type dropdown + "Apply to N customers".
- Applies via one `update customers set customer_type_id = ? where id in (...)` call. No confirm dialog — the change is trivially re-editable.
- Backfill workflow: filter Uncategorized → select all → assign.

### 4. CSV import warning

- `BulkCustomerUploadDialog` preview shows: "N of M rows have a blank or unmatched customer type and will be imported as Uncategorized", with affected rows highlighted. Import proceeds either way (current lenient behavior, made visible).

## Dependencies / Risks

- **RLS:** verify the `customers` table has an UPDATE policy for business users before building the mutations. (Balance-repair work has updated this table before, so it almost certainly does.)
- Dashboard requires no changes — it already buckets null/missing types as "Uncategorized"; the fix drains that bucket at the data layer.

## Verification (no test framework in project — manual drive)

1. Create a customer without picking a type → save blocked with inline error (both dialog and order inline flow).
2. Quick-set a type on an uncategorized customer → dashboard pie moves their revenue out of Uncategorized.
3. Filter Uncategorized → select all → bulk assign → count drops to zero for selection.
4. CSV-import a sheet containing one blank-type and one typo-type row → warning shows "2 of M", rows highlighted, import succeeds as Uncategorized.
