import { describe, it, expect } from 'vitest';
import { normalizeCustomerName, isSameCustomerName, longestNameToken, filterDuplicates } from './duplicate-customer';

describe('normalizeCustomerName', () => {
  it('lowercases and trims', () => {
    expect(normalizeCustomerName('  Swiftcure Pharmacy ')).toBe('swiftcure pharmacy');
  });
  it('collapses punctuation and whitespace runs to single spaces', () => {
    expect(normalizeCustomerName('Swiftcure,  Pharmacy.')).toBe('swiftcure pharmacy');
    expect(normalizeCustomerName('N&H Grocer Pvt. Ltd')).toBe('n h grocer pvt ltd');
  });
  it('returns empty string for blank/punctuation-only input', () => {
    expect(normalizeCustomerName('   ')).toBe('');
    expect(normalizeCustomerName('--')).toBe('');
  });
});

describe('isSameCustomerName', () => {
  it('matches case/punctuation/spacing variants', () => {
    expect(isSameCustomerName('Swiftcure Pharmacy', 'swiftcure pharmacy ')).toBe(true);
    expect(isSameCustomerName('N&H Grocer Pvt. Ltd', 'N & H Grocer Pvt Ltd')).toBe(true);
  });
  it('does not match distinct branch accounts', () => {
    expect(isSameCustomerName('Nina and Hager Grocer Pvt. Ltd', 'Nina & Hager-Sunakothi')).toBe(false);
  });
  it('never matches on empty names', () => {
    expect(isSameCustomerName('', '')).toBe(false);
    expect(isSameCustomerName('  ', '  ')).toBe(false);
  });
});

describe('longestNameToken', () => {
  it('picks the most distinctive token for the ilike net', () => {
    expect(longestNameToken('N&H Grocer Pvt. Ltd')).toBe('grocer');
    expect(longestNameToken('Swiftcure Pharmacy')).toBe('swiftcure');
  });
  it('returns empty for blank input', () => {
    expect(longestNameToken('  ')).toBe('');
  });
});

describe('filterDuplicates', () => {
  const candidates = [
    { id: 1, name: 'Swiftcure Pharmacy', phone: null, address: null },
    { id: 2, name: 'Swiftcure Pharmacy - Patan', phone: null, address: null },
  ];
  it('keeps exact normalized matches only', () => {
    expect(filterDuplicates('swiftcure pharmacy ', candidates).map((c) => c.id)).toEqual([1]);
  });
});
