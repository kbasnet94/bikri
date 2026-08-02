import { describe, it, expect } from 'vitest';
import { isBusinessCustomer, defaultPaymentStatus, needsBusinessPaymentWarning } from './payment-defaults';

const biz = { customer_type: { is_business: true } };
const consumer = { customer_type: { is_business: false } };
const untyped = { customer_type: null };

describe('isBusinessCustomer', () => {
  it('true only when the joined type has is_business', () => {
    expect(isBusinessCustomer(biz)).toBe(true);
    expect(isBusinessCustomer(consumer)).toBe(false);
    expect(isBusinessCustomer(untyped)).toBe(false);
    expect(isBusinessCustomer(null)).toBe(false);
    expect(isBusinessCustomer(undefined)).toBe(false);
  });
});

describe('defaultPaymentStatus', () => {
  it('Credit for business customers, empty otherwise', () => {
    expect(defaultPaymentStatus(biz)).toBe('Credit');
    expect(defaultPaymentStatus(consumer)).toBe('');
    expect(defaultPaymentStatus(untyped)).toBe('');
    expect(defaultPaymentStatus(null)).toBe('');
  });
});

describe('needsBusinessPaymentWarning', () => {
  it('fires only for business customers picking COD or Bank Transfer/QR', () => {
    expect(needsBusinessPaymentWarning(biz, 'COD')).toBe(true);
    expect(needsBusinessPaymentWarning(biz, 'Bank Transfer/QR')).toBe(true);
    expect(needsBusinessPaymentWarning(biz, 'Credit')).toBe(false);
    expect(needsBusinessPaymentWarning(consumer, 'COD')).toBe(false);
    expect(needsBusinessPaymentWarning(untyped, 'Bank Transfer/QR')).toBe(false);
    expect(needsBusinessPaymentWarning(biz, '')).toBe(false);
  });
});
