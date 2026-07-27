import { describe, it, expect } from 'vitest';
import { usualDiscountLabel } from './usual-discount';

describe('usualDiscountLabel', () => {
  it('null/undefined/invalid → null', () => {
    expect(usualDiscountLabel(null)).toBeNull();
    expect(usualDiscountLabel(undefined)).toBeNull();
    expect(usualDiscountLabel(NaN)).toBeNull();
    expect(usualDiscountLabel(0)).toBeNull();
    expect(usualDiscountLabel(-5)).toBeNull();
    expect(usualDiscountLabel(100)).toBeNull();
  });
  it('formats whole numbers without decimals', () => {
    expect(usualDiscountLabel(12)).toBe('Usual: 12%');
  });
  it('keeps meaningful decimals, trims trailing zeros', () => {
    expect(usualDiscountLabel(12.5)).toBe('Usual: 12.5%');
    expect(usualDiscountLabel(12.5)).not.toContain('12.50');
  });
  it('accepts numeric strings from PostgREST', () => {
    expect(usualDiscountLabel('12.00' as unknown as number)).toBe('Usual: 12%');
  });
});
