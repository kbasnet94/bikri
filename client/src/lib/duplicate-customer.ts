// Duplicate-customer detection on create (spec 2026-08-09). Swiftcure Pharmacy
// was created twice (2026-07-26 and 2026-08-06) with orders split across the two
// accounts; creation flows must surface an existing same-name customer before
// inserting a new row. Matching is deliberately exact-after-normalization:
// branch accounts like "Nina & Hager-Sunakothi" must stay creatable.
//
// Pure module — no supabase import, so it is unit-testable in node (the
// ledger-math.ts pattern). The fetch lives in duplicate-customer-query.ts.

export interface DuplicateCandidate {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
}

// Lowercase, collapse every run of non-alphanumerics to one space.
export function normalizeCustomerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isSameCustomerName(a: string, b: string): boolean {
  const na = normalizeCustomerName(a);
  return na !== '' && na === normalizeCustomerName(b);
}

// The ilike net uses the longest token so "Pvt"/"Ltd" noise doesn't flood the
// candidate page.
export function longestNameToken(name: string): string {
  const tokens = normalizeCustomerName(name).split(' ');
  return tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0] ?? '');
}

export function filterDuplicates(name: string, candidates: DuplicateCandidate[]): DuplicateCandidate[] {
  return candidates.filter((c) => isSameCustomerName(c.name, name));
}
