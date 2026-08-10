import { describe, it, expect } from 'vitest';
import { mapDraftToOrderPrefill, type PrefillProduct, type DraftOrderRow } from './draft-mapping';

const products: PrefillProduct[] = [{ id: 1, name: 'Zesty Lemon 30', price: 195000 }];

const draft: DraftOrderRow = {
  id: 1,
  customer_name: 'Test Person',
  phone: '9800000000',
  address: 'Baneshwor',
  items: [{ sku: 'Zesty Lemon 30', qty: 2, unit_price_cents: 195000 }],
  payment_method: 'cod',
  evidence_urls: [],
  transcript: '',
  status: 'pending',
};

describe('mapDraftToOrderPrefill', () => {
  it('maps a valid COD draft to a prefill', () => {
    const r = mapDraftToOrderPrefill(draft, products);
    expect(r).toMatchObject({
      newCustomerName: 'Test Person',
      newCustomerPhone: '9800000000',
      newCustomerAddress: 'Baneshwor',
      items: [{ productId: 1, quantity: 2 }],
      paymentStatus: 'COD',
      orderChannel: 'instagram',
    });
  });

  it('maps a valid QR draft to the dialog\'s exact bank/QR payment value', () => {
    const r = mapDraftToOrderPrefill({ ...draft, payment_method: 'qr' }, products);
    expect(r).toMatchObject({ paymentStatus: 'Bank Transfer/QR' });
  });

  it('errors when bot price disagrees with the live price list', () => {
    const bad: DraftOrderRow = { ...draft, items: [{ sku: 'Zesty Lemon 30', qty: 1, unit_price_cents: 100000 }] };
    const r = mapDraftToOrderPrefill(bad, products);
    expect(r).toHaveProperty('error');
  });

  it('errors on unknown SKU and invalid phone', () => {
    expect(
      mapDraftToOrderPrefill({ ...draft, items: [{ sku: '??', qty: 1, unit_price_cents: 1 }] }, products)
    ).toHaveProperty('error');
    expect(mapDraftToOrderPrefill({ ...draft, phone: '12' }, products)).toHaveProperty('error');
  });

  it('matches SKU case-insensitively by name inclusion', () => {
    const r = mapDraftToOrderPrefill(
      { ...draft, items: [{ sku: 'zesty lemon 30', qty: 1, unit_price_cents: 195000 }] },
      products
    );
    expect(r).toMatchObject({ items: [{ productId: 1, quantity: 1 }] });
  });

  it('rejects an empty items list', () => {
    const r = mapDraftToOrderPrefill({ ...draft, items: [] }, products);
    expect(r).toHaveProperty('error');
  });
});
