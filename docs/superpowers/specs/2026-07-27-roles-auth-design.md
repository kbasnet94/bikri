# Bikri 2.0 — Roles & Auth Lockdown (Design)

**Date:** 2026-07-27 · **Status:** Approved by Karan (verbal, session of 2026-07-27)
**Sub-project 1 of 4** from the Hydralyte sales-map MRD (roles → margins → locations/map → leads/commission).

## Goal

Bikri becomes a locked-down internal tool: no public sign-up, admin-created accounts only, and four roles — **admin, operations, sales, accounts** — with multi-role support per user. UI is gated by role everywhere; the database itself enforces the two highest-stakes permissions (money writes, user management).

## Roles

| Role | Can do | Cannot do |
|---|---|---|
| admin (Karan) | Everything, incl. Users page | — |
| operations | Orders, inventory, packing, Daraz end-customer location entry; **read** ledger, margins, dashboard financials | Edit ledger/payments; manage users |
| sales | Customers (incl. order history and outstanding balances), future Map/Leads pages, own commission view | Dashboard P&L, other reps' commissions, ledger writes, users |
| accounts | Everything money: record payments, ledger adjustments, credit-limit/margin edits, financial exports | Manage users |

Multi-role = union of permissions (e.g. Abhi = operations + accounts).

## Data model (new tables only; zero changes to existing tables)

- `profiles`: `user_id` (PK, FK auth.users), `full_name`, `phone`, `active` bool default true, `created_at`.
- `user_roles`: `user_id` FK, `role` text CHECK in ('admin','operations','sales','accounts'), one row per role, PK (user_id, role).
- Migration seeds Karan's existing auth user as admin.

## Sign-up lockdown

- Disable public sign-up via Supabase Auth settings (dashboard toggle) at go-live.
- Remove/redirect Bikri's registration UI; login page unchanged.
- Account creation only via admin Users page → Supabase **Edge Function** (service-role key server-side; never in client). Inputs: name, email, temp password. Sets a "must change password on first login" flag; client forces the reset flow.

## Admin Users page (`/users`, admin-only)

- Table: name, email, role badges, active toggle, last sign-in.
- Add User dialog: name, email, temp password (+ generate button), role checkboxes (min 1).
- Edit: change roles, deactivate (blocks login, preserves history), reset password.
- **No hard delete** — deactivate only, so order/ledger attribution never dangles.

## Role-scoped UI

- `useRoles()` hook reads session roles once; drives sidebar visibility, route guards (direct URL → "no access" page), and element-level hiding (e.g. manual ledger-entry button only for accounts/admin).
- Dashboard: financial cards visible to operations (per Karan); sales sees dashboard without P&L numbers.

## RLS — two critical locks only

- Helper SQL function `has_role(role text)` (checks `user_roles` for `auth.uid()`).
- Policy 1: writes to `ledger_entries` / payment-recording require accounts or admin.
- Policy 2: writes to `user_roles` and `profiles` require admin.
- All other tables keep current permissive policies — deliberately no broad RLS rework (Bikri RLS history is fragile; see repo's ~14 rls-fix files).
- **Known fiddly bit (verify during planning):** order creation auto-writes ledger rows (`purchase`/`payment`) from ops users. Policy must allow those system-path writes while blocking manual ledger edits — likely a SECURITY DEFINER RPC for the order path, or a policy distinguishing entry origin. Resolve in the implementation plan.

## Rollout & testing

- Vitest: `has_role` + role-gating logic.
- Manual pass with test operations and sales users.
- Deploy to Vercel preview first; Karan flips the sign-up toggle at go-live; then create Abhi's and Bikash's real accounts (multi-role as needed).
- Rollback trivial: new tables only, existing schema untouched.

## Out of scope (later sub-projects)

Default-margin reference field; `customer_locations` + pin-drop picker + map page; leads pipeline; per-box commission (NPR 30–50/box, vests when client clears credit).
