// Decides which address line(s) the pro forma invoice prints.
// Spec: docs/superpowers/specs/2026-07-30-billing-address-invoice-fallback-design.md
// billing_address = registered/invoice address; address = courier/delivery text.

export type InvoiceAddresses =
  | { billing: string; shipping: string }
  | { single: string }
  | null;

export function resolveInvoiceAddresses(
  customer?: { address?: string | null; billing_address?: string | null }
): InvoiceAddresses {
  const shipping = (customer?.address ?? '').trim();
  const billing = (customer?.billing_address ?? '').trim();

  if (!billing && !shipping) return null;
  if (!billing) return { single: shipping };
  if (!shipping || billing === shipping) return { single: billing };
  return { billing, shipping };
}
