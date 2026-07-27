# Roles & Auth Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock Bikri down to an internal tool: no public sign-up, admin-created accounts, four multi-select roles (admin / operations / sales / accounts) gating the UI, with RLS enforcing money-writes and user management.

**Architecture:** Build on EXISTING infrastructure — `business_users` (membership, currently `role` text), the `invite-team-member` edge function pattern, and `set-password.tsx`. We add a `roles text[]` column (multi-role), a `has_role()` SQL helper + two RLS locks, a `create-team-member` edge function (direct password creation, per Karan's Option A — replaces email invites), a `useRoles()` client hook, and role gating in nav/routes/pages. **Deviation from spec:** spec proposed new `profiles`/`user_roles` tables; we instead extend `business_users` — same approved behavior, less new surface, multi-tenant safe.

**Tech Stack:** Vite + React 18 + Wouter + TanStack Query + shadcn + Supabase (Postgres RLS, Edge Functions/Deno). Tests: vitest.

## Global Constraints

- Repo: `C:\Users\Karan2\Desktop\All Cursor Projects\Bikri 2.0`, branch `main`, deployed on Vercel.
- tsc baseline has 10 pre-existing errors — gate on "no NEW errors" (`npm run check`).
- Never run bare `tsc` on individual files (emits stray `.js` that breaks vitest).
- PostgREST max-rows cap is 1000 — any "fetch all" must paginate `.range()` with `order('id')`.
- Money is stored in cents. Do not touch ledger math (`client/src/lib/ledger-math.ts`).
- SQL migrations: write a `.sql` file in repo root (existing convention, e.g. `supabase-rls-*.sql`), applied manually via Supabase Studio SQL editor. Each SQL task ends with a verification query, not a unit test.
- Existing RLS is fragile (~14 fix files). Add ONLY the policies in this plan; never drop/replace existing policies.
- Role values, exactly: `'admin' | 'operations' | 'sales' | 'accounts'`.
- Prime Nutrition business_id: `136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c`; Karan's user_id: `f568ec41-6179-4ba9-8454-0663cf854422`.

---

### Task 1: Roles column + has_role() helper (SQL)

**Files:**
- Create: `supabase-roles-migration.sql` (repo root)

**Interfaces:**
- Produces: `business_users.roles text[]`, `business_users.full_name text`, `business_users.active boolean`, SQL function `public.has_role(check_role text) returns boolean`.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase-roles-migration.sql
-- Adds multi-role support to business_users + has_role() helper.
ALTER TABLE business_users
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE business_users
  ADD CONSTRAINT business_users_roles_valid
  CHECK (roles <@ ARRAY['admin','operations','sales','accounts']::text[]);

-- Backfill: every existing owner becomes admin.
UPDATE business_users SET roles = ARRAY['admin'] WHERE role = 'owner' AND roles = '{}';

-- true if the CURRENT auth user has check_role (or is admin) in ANY active membership.
CREATE OR REPLACE FUNCTION public.has_role(check_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.active
      AND (check_role = ANY(bu.roles) OR 'admin' = ANY(bu.roles))
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
```

- [ ] **Step 2: Apply in Supabase Studio SQL editor** (project `zezmnkdinddjqnpfnaoq`) — paste the file, run.

- [ ] **Step 3: Verify**

Run in SQL editor:
```sql
SELECT user_id, role, roles, active FROM business_users;
SELECT proname FROM pg_proc WHERE proname = 'has_role';
```
Expected: Karan's row (`f568ec41-…`) has `roles = {admin}`; every owner row has `{admin}`; `has_role` exists.

- [ ] **Step 4: Commit**

```bash
git add supabase-roles-migration.sql
git commit -m "feat: multi-role columns on business_users + has_role() helper"
```

---

### Task 2: RLS locks — ledger writes + membership writes (SQL)

**Files:**
- Create: `supabase-roles-rls.sql` (repo root)

**Interfaces:**
- Consumes: `has_role(text)` from Task 1.
- Produces: RLS behavior later tasks rely on: order-linked ledger writes allowed for any active member; manual ledger writes (order_id IS NULL) require accounts/admin; `business_users` writes require admin.

The system path (order create/edit/cancel in `use-orders.ts`) ALWAYS writes ledger rows with `order_id` set; manual ledger entries have `order_id NULL`. That distinction is the enforcement line — no RPC rewrite needed.

- [ ] **Step 1: Inspect existing ledger_entries policies** (SQL editor):

```sql
SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('ledger_entries','business_users');
```
Record output in the task notes. Do NOT drop anything found here.

- [ ] **Step 2: Write the policy file**

```sql
-- supabase-roles-rls.sql
-- Lock 1: manual ledger writes require accounts/admin; order-linked writes stay open to members.
CREATE POLICY ledger_manual_insert_accounts ON ledger_entries
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (order_id IS NOT NULL OR has_role('accounts'));
CREATE POLICY ledger_manual_update_accounts ON ledger_entries
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (order_id IS NOT NULL OR has_role('accounts'));
CREATE POLICY ledger_manual_delete_accounts ON ledger_entries
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (order_id IS NOT NULL OR has_role('accounts'));

-- Lock 2: only admins manage memberships/roles.
CREATE POLICY business_users_write_admin_ins ON business_users
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (has_role('admin'));
CREATE POLICY business_users_write_admin_upd ON business_users
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (has_role('admin'));
CREATE POLICY business_users_write_admin_del ON business_users
  AS RESTRICTIVE FOR DELETE TO authenticated USING (has_role('admin'));
```

RESTRICTIVE policies AND-combine with existing permissive ones, so existing behavior is narrowed, never widened — this is why nothing is dropped.

- [ ] **Step 3: Apply in SQL editor.**

- [ ] **Step 4: Verify as Karan (admin)** — in the live app, create an order and confirm it still succeeds (ledger rows written via order path). In SQL editor confirm policies exist:
```sql
SELECT policyname FROM pg_policies WHERE policyname LIKE 'ledger_manual%' OR policyname LIKE 'business_users_write%';
```
Expected: 6 rows. (Non-admin verification happens in Task 8 once a test ops user exists.)

- [ ] **Step 5: Commit**

```bash
git add supabase-roles-rls.sql
git commit -m "feat: RLS locks for manual ledger writes and membership management"
```

---

### Task 3: Role logic module + tests (client)

**Files:**
- Create: `client/src/lib/roles.ts`
- Test: `client/src/lib/roles.test.ts`

**Interfaces:**
- Produces: `type Role = 'admin'|'operations'|'sales'|'accounts'`; `canAccess(roles: Role[], resource: Resource): boolean`; `type Resource = 'dashboard'|'dashboard-financials'|'inventory'|'customers'|'orders'|'ledger-edit'|'users'|'account'`; `NAV_RESOURCES: Record<string, Resource>` mapping hrefs to resources.

- [ ] **Step 1: Write the failing test**

```ts
// client/src/lib/roles.test.ts
import { describe, it, expect } from 'vitest';
import { canAccess } from './roles';

describe('canAccess', () => {
  it('admin can access everything', () => {
    (['dashboard','dashboard-financials','inventory','customers','orders','ledger-edit','users','account'] as const)
      .forEach(r => expect(canAccess(['admin'], r)).toBe(true));
  });
  it('operations: orders/inventory/customers/dashboard incl. financials, no ledger-edit, no users', () => {
    expect(canAccess(['operations'], 'orders')).toBe(true);
    expect(canAccess(['operations'], 'inventory')).toBe(true);
    expect(canAccess(['operations'], 'dashboard-financials')).toBe(true);
    expect(canAccess(['operations'], 'ledger-edit')).toBe(false);
    expect(canAccess(['operations'], 'users')).toBe(false);
  });
  it('sales: customers + dashboard without financials', () => {
    expect(canAccess(['sales'], 'customers')).toBe(true);
    expect(canAccess(['sales'], 'dashboard')).toBe(true);
    expect(canAccess(['sales'], 'dashboard-financials')).toBe(false);
    expect(canAccess(['sales'], 'orders')).toBe(false);
    expect(canAccess(['sales'], 'inventory')).toBe(false);
  });
  it('accounts: everything money incl. ledger-edit, plus read pages, not users', () => {
    expect(canAccess(['accounts'], 'ledger-edit')).toBe(true);
    expect(canAccess(['accounts'], 'customers')).toBe(true);
    expect(canAccess(['accounts'], 'dashboard-financials')).toBe(true);
    expect(canAccess(['accounts'], 'users')).toBe(false);
  });
  it('multi-role is a union', () => {
    expect(canAccess(['operations','sales'], 'orders')).toBe(true);
    expect(canAccess(['operations','sales'], 'dashboard-financials')).toBe(true);
  });
  it('no roles → only account page (own profile)', () => {
    expect(canAccess([], 'dashboard')).toBe(false);
    expect(canAccess([], 'account')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run client/src/lib/roles.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// client/src/lib/roles.ts
export type Role = 'admin' | 'operations' | 'sales' | 'accounts';
export type Resource =
  | 'dashboard' | 'dashboard-financials' | 'inventory' | 'customers'
  | 'orders' | 'ledger-edit' | 'users' | 'account';

const GRANTS: Record<Role, Resource[]> = {
  admin: ['dashboard','dashboard-financials','inventory','customers','orders','ledger-edit','users','account'],
  operations: ['dashboard','dashboard-financials','inventory','customers','orders','account'],
  sales: ['dashboard','customers','account'],
  accounts: ['dashboard','dashboard-financials','inventory','customers','orders','ledger-edit','account'],
};

export function canAccess(roles: Role[], resource: Resource): boolean {
  if (resource === 'account') return true; // everyone manages their own profile
  return roles.some(r => GRANTS[r]?.includes(resource));
}

export const NAV_RESOURCES: Record<string, Resource> = {
  '/': 'dashboard',
  '/inventory': 'inventory',
  '/customers': 'customers',
  '/orders': 'orders',
  '/account': 'account',
};
```

- [ ] **Step 4: Run tests** — `npx vitest run client/src/lib/roles.test.ts` → PASS. Also `npm run check` → no NEW errors vs the 10-error baseline.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/roles.ts client/src/lib/roles.test.ts
git commit -m "feat: role grants model with canAccess()"
```

---

### Task 4: Surface roles in useAuth

**Files:**
- Modify: `client/src/hooks/use-auth.ts` (AuthUser interface ~line 4-12; fetchUser business query ~line 51-63 and return ~line 86-94)

**Interfaces:**
- Consumes: `Role` from `client/src/lib/roles.ts`.
- Produces: `AuthUser.roles: Role[]` and `AuthUser.fullName?: string` — later tasks call `useAuth().user?.roles ?? []`.

- [ ] **Step 1: Extend the interface**

```ts
import type { Role } from '@/lib/roles';

export interface AuthUser {
  id: string;
  email: string;
  businessId?: string;
  businessName?: string;
  panVatNumber?: string;
  role?: string;        // legacy, keep
  roles: Role[];        // NEW
  fullName?: string;    // NEW
  currency?: string;
}
```

- [ ] **Step 2: Fetch roles** — in `fetchUser`, change the `business_users` select to include the new columns:

```ts
const { data: businessUser, error: businessError } = await supabase
  .from('business_users')
  .select(`
    role,
    roles,
    full_name,
    active,
    business:businesses ( id, name, currency, pan_vat_number )
  `)
  .eq('user_id', user.id)
  .single();
```

In the success return add `roles: (businessUser.roles ?? []) as Role[], fullName: businessUser.full_name ?? undefined`. In BOTH early-return branches (business error / no membership) add `roles: []`. If `businessUser.active === false`, call `await supabase.auth.signOut()` and return null (deactivated users bounce).

- [ ] **Step 3: Verify** — `npm run check` (no new errors); log in locally (`npm run dev`), confirm console `[Auth]` logs show the user object with `roles: ['admin']`.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/use-auth.ts
git commit -m "feat: expose roles and fullName on AuthUser; sign out deactivated users"
```

---

### Task 5: Kill public sign-up (client)

**Files:**
- Modify: `client/src/pages/login.tsx` (remove register mode: `AuthMode` type line ~13, `useRegister` import line ~10, `handleRegister` ~line 42-, "Sign up" link ~line 217-226 and the register form block)
- Modify: `client/src/hooks/use-auth.ts` (delete the entire `useRegister` export, lines ~148-223)

**Interfaces:**
- Consumes: nothing new. Produces: login page with no path to sign-up.

- [ ] **Step 1: Strip register UI** — in `login.tsx`: delete the `register` variant from `AuthMode` (make it just `"login"` or remove the state entirely), delete `handleRegister`, the register form JSX, and the "Sign up" link/button. Keep the login form and set-password redirect logic untouched.

- [ ] **Step 2: Delete `useRegister`** from `use-auth.ts` (no other file imports it — verify with `grep -rn "useRegister" client/src` → only login.tsx pre-change).

- [ ] **Step 3: Verify** — `npm run check` (no new errors); `npm run dev` → login page renders with no sign-up affordance; logging in still works.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/login.tsx client/src/hooks/use-auth.ts
git commit -m "feat: remove public sign-up UI"
```

(The Supabase dashboard "Allow new users to sign up" toggle is flipped at go-live — Task 8.)

---

### Task 6: create-team-member edge function (replaces invite flow)

**Files:**
- Create: `supabase/functions/create-team-member/index.ts`
- Reference: `supabase/functions/invite-team-member/index.ts` (copy its CORS + caller-verification skeleton exactly)

**Interfaces:**
- Consumes: caller JWT; body `{ email, password, fullName, businessId, roles }` where `roles: string[]` ⊆ the four role values.
- Produces: HTTP 200 `{ userId }`. Later tasks call it via `POST ${supabaseUrl}/functions/v1/create-team-member`.

- [ ] **Step 1: Write the function** — copy the skeleton from `invite-team-member/index.ts` (CORS headers, OPTIONS handling, caller verification via anon client + JWT, admin client via service role). Replace the invite logic after caller verification with:

```ts
const { email, password, fullName, businessId, roles } = await req.json();
const VALID = ["admin", "operations", "sales", "accounts"];
if (!email || !password || !businessId || !Array.isArray(roles) || roles.length === 0
    || !roles.every((r: string) => VALID.includes(r))) {
  return new Response(JSON.stringify({ error: "email, password, businessId and valid roles[] required" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
if (password.length < 8) {
  return new Response(JSON.stringify({ error: "password must be at least 8 characters" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Caller must be an admin member of this business.
const { data: callerRow } = await supabaseAdmin
  .from("business_users").select("roles")
  .eq("user_id", caller.id).eq("business_id", businessId).single();
if (!callerRow || !(callerRow.roles ?? []).includes("admin")) {
  return new Response(JSON.stringify({ error: "Only admins can create users" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Create the auth user directly with a temp password (no email round-trip).
const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
  email, password, email_confirm: true,
  user_metadata: { must_change_password: true, full_name: fullName ?? null },
});
if (createError) {
  return new Response(JSON.stringify({ error: createError.message }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const { error: linkError } = await supabaseAdmin.from("business_users").insert({
  business_id: businessId, user_id: created.user.id,
  role: "member", roles, full_name: fullName ?? null, active: true,
});
if (linkError) {
  await supabaseAdmin.auth.admin.deleteUser(created.user.id); // roll back orphan auth user
  return new Response(JSON.stringify({ error: linkError.message }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

return new Response(JSON.stringify({ userId: created.user.id }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
```

- [ ] **Step 2: Deploy** — `npx supabase functions deploy create-team-member --project-ref zezmnkdinddjqnpfnaoq` (secrets SUPABASE_URL/ANON/SERVICE_ROLE are auto-provided to functions).

- [ ] **Step 3: Verify with curl** — call with Karan's session JWT (grab from browser devtools localStorage `sb-…-auth-token`) creating a throwaway user `test-ops@bikri.internal` / roles `["operations"]`, business `136a5cfa-e27a-4a4b-bb2e-ce4f042fdf6c`. Expected: 200 + userId; row appears in `business_users` with `roles={operations}`. Keep this test user — Task 8 uses it.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/create-team-member/index.ts
git commit -m "feat: create-team-member edge function (admin-created accounts with temp password)"
```

---

### Task 7: Role-gated nav, routes, and Users management UI

**Files:**
- Modify: `client/src/components/layout.tsx` (nav items ~line 25-29)
- Modify: `client/src/App.tsx` (`ProtectedRoute` ~line 22)
- Modify: `client/src/pages/account.tsx` (Team Members card ~line 466-626: swap invite dialog → create dialog; add role checkboxes + active toggle)
- Modify: `client/src/pages/dashboard.tsx` (wrap financial stat cards)
- Modify: `client/src/pages/set-password.tsx` (clear `must_change_password` after update)

**Interfaces:**
- Consumes: `useAuth().user.roles`, `canAccess`, `NAV_RESOURCES` (Task 3/4), edge function (Task 6).

- [ ] **Step 1: Gate nav** — in `layout.tsx`, filter items:

```ts
import { canAccess, NAV_RESOURCES } from "@/lib/roles";
import { useAuth } from "@/hooks/use-auth";
// inside component:
const { user } = useAuth();
const roles = user?.roles ?? [];
const visibleItems = navItems.filter(i => canAccess(roles, NAV_RESOURCES[i.href]));
```
Render `visibleItems` instead of `navItems`.

- [ ] **Step 2: Guard routes** — in `App.tsx`, extend `ProtectedRoute` with an optional `resource` prop:

```tsx
function ProtectedRoute({ component: Component, resource }:
  { component: React.ComponentType; resource?: Resource }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  // ...existing loading/redirect logic unchanged...
  if (resource && !canAccess(user?.roles ?? [], resource)) {
    return <div className="p-8 text-center text-muted-foreground">You don't have access to this page.</div>;
  }
  return <Component />;
}
```
Pass `resource="dashboard" | "inventory" | "customers" | "orders"` on the respective routes; `/account` stays ungated.

- [ ] **Step 3: Forced password change** — in `App.tsx` (or layout), after auth loads: if `session.user.user_metadata.must_change_password === true` and location !== '/set-password', `<Redirect to="/set-password" />`. In `set-password.tsx`, after the successful `supabase.auth.updateUser({ password })`, also call `supabase.auth.updateUser({ data: { must_change_password: false } })`, then redirect to `/`.

- [ ] **Step 4: Users management in account.tsx** — replace the invite-based "Add Team Member" dialog with a create dialog: fields Full name, Email, Temp password (+ "Generate" button: `Math.random().toString(36).slice(-10)`), and four role checkboxes (min one enforced before submit). POST to `create-team-member` with the same auth-header pattern the invite call used (~line 157-163). Member rows: show `full_name`, email, role badges (map over `roles`), an Active switch (admin-only, `update business_users set active`), and an "Edit roles" popover (checkboxes → `update business_users set roles`). Remove the old remove-member destructive flow or keep it as deactivate. Gate the whole Team card behind `canAccess(roles,'users')`.

- [ ] **Step 5: Dashboard financials** — in `dashboard.tsx`, wrap the revenue/outstanding-credit stat cards and revenue chart in `{canAccess(roles,'dashboard-financials') && (...)}`. Order-count/status widgets stay visible to all.

- [ ] **Step 6: Verify** — `npm run check` (no new errors); `npx vitest run` (all green); manual: as Karan (admin) everything visible incl. Team card.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/layout.tsx client/src/App.tsx client/src/pages/account.tsx client/src/pages/dashboard.tsx client/src/pages/set-password.tsx
git commit -m "feat: role-gated nav/routes, admin user management, forced password change"
```

---

### Task 8: End-to-end verification + go-live

**Files:** none (checklist)

- [ ] **Step 1: Preview deploy** — push to a branch, open the Vercel preview URL.
- [ ] **Step 2: Test as ops user** — log in as `test-ops@bikri.internal` (Task 6). Expect: forced to set-password first; then sees Dashboard (with financials), Inventory, Customers, Orders; NO Team card on Account; creating an order succeeds (proves RESTRICTIVE ledger policy passes order-path writes); manual ledger entry UI hidden AND a forced direct PostgREST insert with `order_id: null` fails (RLS).
- [ ] **Step 3: Test as sales user** — create `test-sales@bikri.internal` with roles `["sales"]` via the new UI. Expect: Dashboard without financial cards, Customers visible, Orders/Inventory hidden and direct URL shows "no access".
- [ ] **Step 4: Deactivate test** — toggle test-sales inactive → their next page load signs them out.
- [ ] **Step 5: Go-live** — merge to `main`, verify Vercel production READY. In Supabase Dashboard → Authentication → Providers → Email: turn OFF "Allow new users to sign up". (Keep email+password sign-IN enabled.)
- [ ] **Step 6: Create real users** — Karan creates Abhi (roles per his call, e.g. operations+accounts) and Bikash (sales) via the Users UI, sends temp passwords over WhatsApp DMs.
- [ ] **Step 7: Cleanup** — deactivate/delete the two test users (delete via Supabase Studio is fine for never-used test accounts); commit any doc updates.

```bash
git commit -am "chore: roles & auth lockdown go-live notes"
```
