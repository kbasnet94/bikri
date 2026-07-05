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
    if (!data) return rows;
    rows.push(...(data as T[]));
    if (data.length < page) return rows;
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
    csv.push(`"${(bizName.get(c.business_id) ?? '').replace(/"/g, '""')}",${c.id},"${c.name.replace(/"/g, '""')}",${c.current_balance},${computed},${delta}`);
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
  const agingByCustomer = new Map(aging.map((a) => [a.id, a.total_unpaid]));
  for (const b of businesses) {
    const bizCustomers = freshCustomers.filter((c) => c.business_id === b.id);
    const dash = bizCustomers
      .filter((c) => c.current_balance > 0)
      .reduce((s, c) => s + c.current_balance, 0);
    const view = aging
      .filter((a) => a.business_id === b.id)
      .reduce((s, a) => s + a.total_unpaid, 0);
    const ok = dash === view ? 'OK' : 'MISMATCH';
    console.log(`${ok}  ${b.name}: dashboard=${(dash / 100).toFixed(2)} view=${(view / 100).toFixed(2)}`);
    if (dash !== view) {
      process.exitCode = 1;
      for (const c of bizCustomers) {
        const storedClamped = Math.max(c.current_balance, 0);
        const agingUnpaid = agingByCustomer.get(c.id) ?? 0;
        if (storedClamped !== agingUnpaid) {
          const delta = agingUnpaid - storedClamped;
          console.log(
            `    CUST #${c.id} ${c.name}: stored=${(storedClamped / 100).toFixed(2)} aging=${(agingUnpaid / 100).toFixed(2)} delta=${delta > 0 ? '+' : ''}${(delta / 100).toFixed(2)}`,
          );
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
