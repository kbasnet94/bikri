import { describe, it, expect } from 'vitest';
import { isDeletableLedgerEntry, deletionBalanceDelta, ledgerDeleteControl } from './ledger-delete';

describe('isDeletableLedgerEntry', () => {
  it('manual entries (no order) are deletable', () => {
    expect(isDeletableLedgerEntry({ order_id: null })).toBe(true);
  });
  it('order-linked entries are not', () => {
    expect(isDeletableLedgerEntry({ order_id: 3474 })).toBe(false);
    expect(isDeletableLedgerEntry({ order_id: 0 })).toBe(false);
  });
});

describe('ledgerDeleteControl', () => {
  it('admin/accounts (ledger-edit + write): shown and enabled', () => {
    expect(ledgerDeleteControl({ canEditLedger: true, canWrite: true })).toEqual({ show: true, disabled: false });
  });
  it('full viewer (no write): shown but disabled, never hidden', () => {
    expect(ledgerDeleteControl({ canEditLedger: false, canWrite: false })).toEqual({ show: true, disabled: true });
  });
  it('operations/sales (write but no ledger-edit): hidden', () => {
    expect(ledgerDeleteControl({ canEditLedger: false, canWrite: true })).toEqual({ show: false, disabled: true });
  });
  it('ledger-edit without write (defensive): shown, disabled', () => {
    expect(ledgerDeleteControl({ canEditLedger: true, canWrite: false })).toEqual({ show: true, disabled: true });
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
