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

/**
 * Visibility/enabled state of the delete control for the current user.
 * Roles with ledger-edit (admin, accounts) see it enabled. Read-only users
 * (Full Viewer) see it DISABLED, never hidden (Karan's rule for all write
 * controls, so the read-only tooltip explains why). Everyone else never
 * sees it.
 */
export function ledgerDeleteControl(input: { canEditLedger: boolean; canWrite: boolean }): { show: boolean; disabled: boolean } {
  const show = input.canEditLedger || !input.canWrite;
  const disabled = !input.canEditLedger || !input.canWrite;
  return { show, disabled };
}

/** Change applied to customers.current_balance when this entry is deleted. */
export function deletionBalanceDelta(type: string, amount: number): number {
  return -ledgerBalanceDelta(type, amount);
}
