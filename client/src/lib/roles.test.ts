import { describe, it, expect } from 'vitest';
import { canAccess, ROLE_LABELS, ALL_ROLES } from './roles';

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
  it('full_viewer: reads everything incl. financials, no write, no ledger-edit, no users', () => {
    expect(canAccess(['full_viewer'], 'dashboard')).toBe(true);
    expect(canAccess(['full_viewer'], 'dashboard-financials')).toBe(true);
    expect(canAccess(['full_viewer'], 'inventory')).toBe(true);
    expect(canAccess(['full_viewer'], 'customers')).toBe(true);
    expect(canAccess(['full_viewer'], 'orders')).toBe(true);
    expect(canAccess(['full_viewer'], 'account')).toBe(true);
    expect(canAccess(['full_viewer'], 'write')).toBe(false);
    expect(canAccess(['full_viewer'], 'ledger-edit')).toBe(false);
    expect(canAccess(['full_viewer'], 'users')).toBe(false);
  });
  it('every non-viewer role can write', () => {
    (['admin','operations','sales','accounts'] as const)
      .forEach(r => expect(canAccess([r], 'write')).toBe(true));
  });
  it('full_viewer combined with a write role can write (union)', () => {
    expect(canAccess(['full_viewer','sales'], 'write')).toBe(true);
  });
  it('ALL_ROLES lists every role with a human label', () => {
    expect(ALL_ROLES).toEqual(['admin','operations','sales','accounts','full_viewer']);
    expect(ROLE_LABELS.full_viewer).toBe('Full Viewer');
    ALL_ROLES.forEach(r => expect(typeof ROLE_LABELS[r]).toBe('string'));
  });
  it('no roles → only account page (own profile)', () => {
    expect(canAccess([], 'dashboard')).toBe(false);
    expect(canAccess([], 'account')).toBe(true);
  });
});
