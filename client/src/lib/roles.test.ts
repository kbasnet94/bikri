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
