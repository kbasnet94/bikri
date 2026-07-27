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
