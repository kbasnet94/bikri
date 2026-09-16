export type Role = 'admin' | 'operations' | 'sales' | 'accounts' | 'full_viewer';
export type Resource =
  | 'dashboard' | 'dashboard-financials' | 'inventory' | 'customers'
  | 'orders' | 'ledger-edit' | 'users' | 'account'
  | 'write'; // any create/edit/delete on business data; full_viewer never has it

export const ALL_ROLES: Role[] = ['admin', 'operations', 'sales', 'accounts', 'full_viewer'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  operations: 'Operations',
  sales: 'Sales',
  accounts: 'Accounts',
  full_viewer: 'Full Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Everything, including user management',
  operations: 'Orders, inventory, customers, dashboard',
  sales: 'Customers and dashboard without financials',
  accounts: 'All money pages plus manual ledger entries',
  full_viewer: 'Read-only: sees every page and balance, cannot change anything',
};

const GRANTS: Record<Role, Resource[]> = {
  admin: ['dashboard','dashboard-financials','inventory','customers','orders','ledger-edit','users','account','write'],
  operations: ['dashboard','dashboard-financials','inventory','customers','orders','account','write'],
  sales: ['dashboard','customers','account','write'],
  accounts: ['dashboard','dashboard-financials','inventory','customers','orders','ledger-edit','account','write'],
  full_viewer: ['dashboard','dashboard-financials','inventory','customers','orders','account'],
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
