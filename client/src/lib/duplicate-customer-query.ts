// Supabase side of the duplicate-customer guard — see duplicate-customer.ts
// for the matching rules. RLS scopes the query to the caller's business.
import { supabase } from './supabase';
import { filterDuplicates, longestNameToken, type DuplicateCandidate } from './duplicate-customer';

export type { DuplicateCandidate };

export async function findDuplicateCustomers(name: string): Promise<DuplicateCandidate[]> {
  const net = longestNameToken(name);
  if (!net) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, address')
    .ilike('name', `%${net}%`)
    .order('name', { ascending: true })
    .limit(25);
  if (error) throw error;
  return filterDuplicates(name, (data ?? []) as DuplicateCandidate[]);
}
