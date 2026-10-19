import { describe, it, expect } from 'vitest';
import { fetchAllRows } from './fetch-all-rows';

/** Fake PostgREST source: serves `total` rows, hard-capped per request like db-max-rows. */
function fakeSource(total: number, serverCap = 1000) {
  const calls: Array<[number, number]> = [];
  const buildQuery = () => ({
    range: async (from: number, to: number) => {
      calls.push([from, to]);
      const requested = to - from + 1;
      const size = Math.min(requested, serverCap);
      const data = Array.from({ length: Math.max(0, Math.min(size, total - from)) }, (_, i) => ({ id: from + i + 1 }));
      return { data, error: null };
    },
  });
  return { buildQuery, calls };
}

describe('fetchAllRows', () => {
  it('returns every row when the set is larger than one page (the 1000-row cap bug)', async () => {
    const { buildQuery, calls } = fakeSource(2345);
    const rows = await fetchAllRows(buildQuery);
    expect(rows).toHaveLength(2345);
    expect(rows[0].id).toBe(1);
    expect(rows[2344].id).toBe(2345);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2345); // no duplicates
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops after one request when the first page is short', async () => {
    const { buildQuery, calls } = fakeSource(40);
    const rows = await fetchAllRows(buildQuery);
    expect(rows).toHaveLength(40);
    expect(calls).toHaveLength(1);
  });

  it('makes one extra empty request when the total is an exact multiple of the page size', async () => {
    const { buildQuery, calls } = fakeSource(2000);
    const rows = await fetchAllRows(buildQuery);
    expect(rows).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it('returns [] for an empty set', async () => {
    const { buildQuery } = fakeSource(0);
    expect(await fetchAllRows(buildQuery)).toEqual([]);
  });

  it('honours a custom page size', async () => {
    const { buildQuery, calls } = fakeSource(25);
    const rows = await fetchAllRows(buildQuery, 10);
    expect(rows).toHaveLength(25);
    expect(calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });

  it('builds a fresh query per page (does not reuse a consumed builder)', async () => {
    let builds = 0;
    const { buildQuery } = fakeSource(1500);
    await fetchAllRows(() => { builds++; return buildQuery(); });
    expect(builds).toBe(2);
  });

  it('throws the PostgREST error instead of returning a partial set', async () => {
    const buildQuery = () => ({
      range: async (from: number) =>
        from === 0
          ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 })), error: null }
          : { data: null, error: new Error('boom') },
    });
    await expect(fetchAllRows(buildQuery)).rejects.toThrow('boom');
  });

  it('rejects a non-positive page size', async () => {
    const { buildQuery } = fakeSource(5);
    await expect(fetchAllRows(buildQuery, 0)).rejects.toThrow(/pageSize/);
  });
});
