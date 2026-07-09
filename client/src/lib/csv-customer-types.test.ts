import { describe, it, expect } from 'vitest';
import { findUntypedRows } from './csv-customer-types';

describe('findUntypedRows', () => {
  const typeNames = ['Retail', 'Wholesale'];

  it('flags rows with blank or missing customerType', () => {
    const rows = [
      { customerType: 'Retail' },
      { customerType: '' },
      {},
      { customerType: '   ' },
    ];
    expect(findUntypedRows(rows, typeNames)).toEqual([1, 2, 3]);
  });

  it('flags rows whose type matches no existing name', () => {
    const rows = [
      { customerType: 'Retail' },
      { customerType: 'Retial' },
      { customerType: 'Distributor' },
    ];
    expect(findUntypedRows(rows, typeNames)).toEqual([1, 2]);
  });

  it('matches case-insensitively and trims', () => {
    const rows = [
      { customerType: 'retail' },
      { customerType: ' WHOLESALE ' },
    ];
    expect(findUntypedRows(rows, typeNames)).toEqual([]);
  });

  it('flags every row when no types exist', () => {
    expect(findUntypedRows([{ customerType: 'Retail' }], [])).toEqual([0]);
  });
});
