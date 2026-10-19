/**
 * Page through a PostgREST query until it is exhausted.
 *
 * This Supabase project has `db-max-rows: 1000`, so any `.select()` that is
 * supposed to return "all rows" is silently truncated at 1000 regardless of
 * `.limit(N)`. The only safe way to read a full set is `.range()` batches.
 *
 * `buildQuery` must return a FRESH query each call that already carries its
 * filters and a deterministic `.order()` ending in a unique tiebreaker (`id`);
 * without a stable order, pages can duplicate or drop rows between calls.
 */
export const DEFAULT_PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export async function fetchAllRows<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<PageResult<T>> },
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`fetchAllRows: pageSize must be a positive integer, got ${pageSize}`);
  }
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
