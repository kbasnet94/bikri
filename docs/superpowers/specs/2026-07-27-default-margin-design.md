# Bikri 2.0 — Default Client Discount Reference (Design)

**Date:** 2026-07-27 · **Status:** Approved by Karan (verbal, session of 2026-07-27)
**Sub-project 2 of 4** from the Hydralyte sales-map MRD. Builds on the shipped roles system (`canAccess`, roles on `business_users`).

## Goal

Each B2B client carries a "usual discount %" so order entry doesn't require remembering per-client terms. It is **reference-only**: displayed beside the discount input, never auto-applied — one-off deals (free sample boxes at 100% discount) must never poison the next order.

## Decisions (Karan)

- Value = a single **discount %** per customer. No pricing-notes field (bonuses/free samples are order-basis, not recorded).
- Reference-only display; user always types (or explicitly clicks to copy) the discount.
- Editable by **accounts/admin** only; visible to anyone who can create orders.
- **Backfill from order history** for customers typed Retail/Pharmacy/Gym or with ≥1 Credit-payment order.

## Data

- `customers.default_discount_pct numeric(5,2)` NULL (null = no usual discount recorded). Additive migration; nothing else changes.

## Backfill rule (one-time, in the migration SQL)

Eligible customers: `customer_type_id` ∈ (Gym=3, Retail=4, Pharmacy=7) OR having ≥1 order with `payment_status = 'Credit'` (non-cancelled).
For each: compute per-item discount % = `ROUND(discount * 100.0 / unit_price)` over items of their non-cancelled orders; **exclude 100% items** (sample boxes) and 0% items; take the mode, ties → the % from the most recent order. Customers with no qualifying discounted items stay NULL.

## UI

- **Customer details dialog + Add Customer dialog:** "Usual discount %" field. Input enabled only for `canAccess(roles, 'ledger-edit')` (accounts/admin — same money-edit gate); read-only text otherwise.
- **Order form (product/discount step):** when the selected customer has a non-null value, show a muted hint beside the discount input: `Usual: 12%`. Clicking the hint copies the value into the input (deliberate action). Never pre-filled.
- Cents/percent note: `default_discount_pct` is a percentage (0–100 with 2dp), NOT cents — do not multiply by 100 on save.

## Non-goals

- No RLS for this column (UI gating suffices; ledger stays the money authority — consistent with the hybrid enforcement decision).
- No enforcement or validation of orders against the reference value.
- No scheme/bonus tracking.

## Testing / rollout

- Vitest: hint-visibility + click-to-copy logic; mode-with-tiebreak helper if implemented client-side (backfill itself is SQL, verified by query).
- Backfill dry-run: SELECT preview of computed values reviewed before UPDATE (both in one SQL file, preview query commented at top).
- Deploy: migration SQL via Studio (Karan), frontend via normal main push.
