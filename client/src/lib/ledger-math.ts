// Single source of truth for how ledger entry types move a customer's balance.
// Mirrors the deployed customer_aging view (supabase-customer-aging-view.sql):
// purchase/debit/adjustment raise what the customer owes; credit/payment lower it;
// entries tied to a cancelled order are ignored entirely.

const BALANCE_REDUCING_TYPES = new Set(['credit', 'payment']);

export function isBalanceReducing(type: string): boolean {
  return BALANCE_REDUCING_TYPES.has(type);
}

export function ledgerBalanceDelta(type: string, amount: number): number {
  return isBalanceReducing(type) ? -amount : amount;
}

export function cancellationEffects(
  paymentStatus: string,
  totalAmount: number,
): { balanceDelta: number; createReversalEntry: boolean } {
  // Only Credit orders added to current_balance at creation, so only they
  // reverse it. COD/Bank orders carry purchase+payment entries that already
  // net to zero — a reversal entry would double-reverse them.
  if (paymentStatus === 'Credit') {
    return { balanceDelta: -totalAmount, createReversalEntry: true };
  }
  return { balanceDelta: 0, createReversalEntry: false };
}

export function paymentStatusChangeEffects(
  oldStatus: string,
  newStatus: string,
  totalAmount: number,
): { balanceDelta: number; ledgerAction: 'insert-payment' | 'delete-auto-payment' | 'none' } {
  const wasCredit = oldStatus === 'Credit';
  const isCredit = newStatus === 'Credit';
  if (wasCredit && !isCredit) {
    return { balanceDelta: -totalAmount, ledgerAction: 'insert-payment' };
  }
  if (!wasCredit && isCredit) {
    return { balanceDelta: totalAmount, ledgerAction: 'delete-auto-payment' };
  }
  return { balanceDelta: 0, ledgerAction: 'none' };
}

export function computeCustomerBalance(
  entries: { type: string; amount: number; order_id: number | null }[],
  cancelledOrderIds: Set<number>,
): number {
  return entries.reduce((sum, e) => {
    if (e.order_id !== null && cancelledOrderIds.has(e.order_id)) return sum;
    return sum + ledgerBalanceDelta(e.type, e.amount);
  }, 0);
}

export function findOrphanReversalEntryIds(
  entries: { id: number; type: string; order_id: number | null }[],
  orders: { id: number; status: string; payment_status: string }[],
): number[] {
  const cancelledNonCredit = new Set(
    orders
      .filter((o) => o.status === 'cancelled' && o.payment_status !== 'Credit')
      .map((o) => o.id),
  );
  return entries
    .filter(
      (e) =>
        e.type === 'credit' &&
        e.order_id !== null &&
        cancelledNonCredit.has(e.order_id),
    )
    .map((e) => e.id);
}
