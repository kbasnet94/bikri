import { describe, it, expect } from 'vitest';
import { resolveInvoiceAddresses } from './invoice-address';

describe('resolveInvoiceAddresses', () => {
  it('no customer or both blank → null', () => {
    expect(resolveInvoiceAddresses(undefined)).toBeNull();
    expect(resolveInvoiceAddresses({})).toBeNull();
    expect(resolveInvoiceAddresses({ address: null, billing_address: null })).toBeNull();
    expect(resolveInvoiceAddresses({ address: '  ', billing_address: '' })).toBeNull();
  });

  it('billing blank → single line with address (fallback)', () => {
    expect(resolveInvoiceAddresses({ address: 'Balaju, KTM', billing_address: null }))
      .toEqual({ single: 'Balaju, KTM' });
    expect(resolveInvoiceAddresses({ address: 'Balaju, KTM', billing_address: '   ' }))
      .toEqual({ single: 'Balaju, KTM' });
  });

  it('billing equals address (trim-equality) → single line', () => {
    expect(resolveInvoiceAddresses({ address: ' Naxal, KTM ', billing_address: 'Naxal, KTM' }))
      .toEqual({ single: 'Naxal, KTM' });
  });

  it('billing differs → both, labelled by caller', () => {
    expect(resolveInvoiceAddresses({ address: 'Warehouse, Balaju', billing_address: 'Head Office, Naxal' }))
      .toEqual({ billing: 'Head Office, Naxal', shipping: 'Warehouse, Balaju' });
  });

  it('billing set, address blank → single line with billing', () => {
    expect(resolveInvoiceAddresses({ address: '', billing_address: 'Head Office, Naxal' }))
      .toEqual({ single: 'Head Office, Naxal' });
  });
});
