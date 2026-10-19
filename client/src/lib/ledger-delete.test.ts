import { describe, it, expect } from 'vitest';
import { isDeletableLedgerEntry, deletionBalanceDelta } from './ledger-delete';

describe('isDeletableLedgerEntry', () => {
  it('manual entries (no order) are deletable', () => {
    expect(isDeletableLedgerEntry({ order_id: null })).toBe(true);
  });
  it('order-linked entries are not', () => {
    expect(isDeletableLedgerEntry({ order_id: 3474 })).toBe(false);
    expect(isDeletableLedgerEntry({ order_id: 0 })).toBe(false);
  });
});

describe('deletionBalanceDelta', () => {
  it('deleting a credit/payment puts the amount back on the balance', () => {
    expect(deletionBalanceDelta('credit', 1704000)).toBe(1704000); // Kopila case
    expect(deletionBalanceDelta('payment', 500)).toBe(500);
  });
  it('deleting a purchase/debit/adjustment removes it from the balance', () => {
    expect(deletionBalanceDelta('purchase', 1000)).toBe(-1000);
    expect(deletionBalanceDelta('debit', 1000)).toBe(-1000);
    expect(deletionBalanceDelta('adjustment', -2)).toBe(2);
  });
});
