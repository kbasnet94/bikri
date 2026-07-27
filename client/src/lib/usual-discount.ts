// PostgREST returns numeric columns as strings; accept both.
export function usualDiscountLabel(pct: number | string | null | undefined): string | null {
  const n = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (n == null || Number.isNaN(n) || n <= 0 || n >= 100) return null;
  const rounded = Math.round(n * 100) / 100;
  return `Usual: ${rounded}%`;
}
