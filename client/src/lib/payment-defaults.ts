// Payment-status defaults driven by the customer type's is_business flag
// (spec 2026-08-02). Wholesale/business clients buy on Credit and settle
// later; auto-paid statuses (COD, Bank Transfer/QR) book a payment entry
// at creation and are almost always a mistake for them.

type CustomerLike = { customer_type?: { is_business?: boolean } | null } | null | undefined;

const AUTO_PAID_STATUSES = new Set(['COD', 'Bank Transfer/QR']);

export function isBusinessCustomer(customer: CustomerLike): boolean {
  return customer?.customer_type?.is_business === true;
}

export function defaultPaymentStatus(customer: CustomerLike): 'Credit' | '' {
  return isBusinessCustomer(customer) ? 'Credit' : '';
}

export function needsBusinessPaymentWarning(customer: CustomerLike, selected: string): boolean {
  return isBusinessCustomer(customer) && AUTO_PAID_STATUSES.has(selected);
}
