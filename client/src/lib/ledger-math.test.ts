import { describe, it, expect } from 'vitest';
import {
  isBalanceReducing,
  ledgerBalanceDelta,
  cancellationEffects,
  paymentStatusChangeEffects,
  computeCustomerBalance,
  findOrphanReversalEntryIds,
} from './ledger-math';

describe('ledgerBalanceDelta', () => {
  it('purchase/debit/adjustment increase the balance', () => {
    expect(ledgerBalanceDelta('purchase', 1000)).toBe(1000);
    expect(ledgerBalanceDelta('debit', 1000)).toBe(1000);
    expect(ledgerBalanceDelta('adjustment', 1000)).toBe(1000);
  });
  it('credit AND payment decrease the balance', () => {
    expect(ledgerBalanceDelta('credit', 1000)).toBe(-1000);
    expect(ledgerBalanceDelta('payment', 1000)).toBe(-1000); // bug D regression test
  });
  it('negative adjustment amounts pass through (legacy -2 entry exists in prod)', () => {
    expect(ledgerBalanceDelta('adjustment', -2)).toBe(-2);
  });
  it('isBalanceReducing matches', () => {
    expect(isBalanceReducing('credit')).toBe(true);
    expect(isBalanceReducing('payment')).toBe(true);
    expect(isBalanceReducing('purchase')).toBe(false);
  });
});

describe('cancellationEffects', () => {
  it('Credit order: reverse balance and write reversal entry', () => {
    expect(cancellationEffects('Credit', 132600_00)).toEqual({
      balanceDelta: -132600_00,
      createReversalEntry: true,
    });
  });
  it('COD order: no balance change, no reversal entry (bug A regression test)', () => {
    expect(cancellationEffects('COD', 1950_00)).toEqual({
      balanceDelta: 0,
      createReversalEntry: false,
    });
  });
  it('Bank Transfer/QR order: no balance change, no reversal entry', () => {
    expect(cancellationEffects('Bank Transfer/QR', 132600_00)).toEqual({
      balanceDelta: 0,
      createReversalEntry: false,
    });
  });
});

describe('paymentStatusChangeEffects', () => {
  it('Credit -> COD: customer paid; insert payment entry, drop balance', () => {
    expect(paymentStatusChangeEffects('Credit', 'COD', 5000)).toEqual({
      balanceDelta: -5000,
      ledgerAction: 'insert-payment',
    });
  });
  it('Credit -> Bank Transfer/QR: same as COD', () => {
    expect(paymentStatusChangeEffects('Credit', 'Bank Transfer/QR', 5000)).toEqual({
      balanceDelta: -5000,
      ledgerAction: 'insert-payment',
    });
  });
  it('COD -> Credit: debt restored; remove auto payment entry, raise balance', () => {
    expect(paymentStatusChangeEffects('COD', 'Credit', 5000)).toEqual({
      balanceDelta: 5000,
      ledgerAction: 'delete-auto-payment',
    });
  });
  it('COD <-> Bank Transfer/QR: relabel only, no financial effect', () => {
    expect(paymentStatusChangeEffects('COD', 'Bank Transfer/QR', 5000)).toEqual({
      balanceDelta: 0,
      ledgerAction: 'none',
    });
  });
  it('same status: no effect', () => {
    expect(paymentStatusChangeEffects('Credit', 'Credit', 5000)).toEqual({
      balanceDelta: 0,
      ledgerAction: 'none',
    });
  });
});

describe('computeCustomerBalance', () => {
  it('active credit order minus a manual payment', () => {
    const entries = [
      { type: 'purchase', amount: 10000, order_id: 1 },
      { type: 'credit', amount: 4000, order_id: null },
    ];
    expect(computeCustomerBalance(entries, new Set())).toBe(6000);
  });
  it('COD order nets to zero', () => {
    const entries = [
      { type: 'purchase', amount: 10000, order_id: 2 },
      { type: 'payment', amount: 10000, order_id: 2 },
    ];
    expect(computeCustomerBalance(entries, new Set())).toBe(0);
  });
  it('entries linked to cancelled orders are excluded entirely', () => {
    const entries = [
      { type: 'purchase', amount: 10000, order_id: 3 }, // cancelled credit order
      { type: 'credit', amount: 10000, order_id: 3 },   // its reversal
      { type: 'purchase', amount: 7000, order_id: 4 },  // live credit order
    ];
    expect(computeCustomerBalance(entries, new Set([3]))).toBe(7000);
  });
  it('advance payment produces a legitimate negative balance', () => {
    const entries = [{ type: 'credit', amount: 5000, order_id: null }];
    expect(computeCustomerBalance(entries, new Set())).toBe(-5000);
  });
});

describe('findOrphanReversalEntryIds', () => {
  const orders = [
    { id: 10, status: 'cancelled', payment_status: 'COD' },
    { id: 11, status: 'cancelled', payment_status: 'Credit' },
    { id: 12, status: 'completed', payment_status: 'COD' },
  ];
  it('flags reversal credits on cancelled NON-Credit orders only', () => {
    const entries = [
      { id: 100, type: 'credit', order_id: 10 },  // orphan (COD cancellation reversal)
      { id: 101, type: 'credit', order_id: 11 },  // legit (Credit cancellation reversal)
      { id: 102, type: 'payment', order_id: 10 }, // auto payment, not a reversal
      { id: 103, type: 'credit', order_id: 12 },  // order not cancelled
      { id: 104, type: 'credit', order_id: null },// manual payment
    ];
    expect(findOrphanReversalEntryIds(entries, orders)).toEqual([100]);
  });
});
