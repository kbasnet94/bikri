// Read-only ledger integrity check (spec 2026-08-02). Run any time:
//   npm run integrity-check
// Checks: (1) active orders' ledger entries match order totals,
// (2) cancelled orders net to zero, (3) stored balances match the ledger.
// NEVER writes to the database.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeCustomerBalance, isBalanceReducing } from '../client/src/lib/ledger-math';

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
    const dr = le.filter((e) => !isBalanceReducing(e.type)).reduce((s, e) => s + e.amount, 0);
    const cr = le.filter((e) => isBalanceReducing(e.type)).reduce((s, e) => s + e.amount, 0);
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
