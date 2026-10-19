import { ledgerBalanceDelta } from './ledger-math';

/**
 * Only hand-entered ledger lines may be deleted. Anything with an order
 * behind it (purchase line, auto COD/Bank payment, cancellation reversal)
 * is changed through the order, which re-syncs stock, ledger and balance.
 * Mirrors the guard inside the delete_manual_ledger_entry RPC.
 */
export function isDeletableLedgerEntry(entry: { order_id: number | null }): boolean {
  return entry.order_id === null;
}

/** Change applied to customers.current_balance when this entry is deleted. */
export function deletionBalanceDelta(type: string, amount: number): number {
  return -ledgerBalanceDelta(type, amount);
}
