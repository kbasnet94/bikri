// Pure mapping from an IG order-bot draft row to the CreateOrderDialog's
// prefill shape. No Supabase calls here — see use-draft-orders.ts for that.
//
// Field names below mirror CreateOrderDialog's actual state in
// client/src/pages/orders.tsx (new-customer fields, cart shape, the
// paymentStatus union "COD" | "Bank Transfer/QR" | "Credit", and
// ORDER_CHANNELS from customer-locations.tsx) — read there before changing
// this file so the two stay in lockstep.

export interface DraftOrderItem {
  sku: string;
  qty: number;
  unit_price_cents: number;
}

export interface DraftOrderRow {
  id: number;
  ig_user_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  items: DraftOrderItem[];
  payment_method: 'cod' | 'qr';
  evidence_urls: string[];
  transcript: string;
  status: string;
  reject_reason?: string | null;
  bikri_order_id?: number | null;
  created_at?: string;
  reviewed_at?: string | null;
}

// Minimal slice of use-products.ts's Product the mapping needs.
export interface PrefillProduct {
  id: number;
  name: string;
  price: number; // cents
}

export interface OrderPrefillItem {
  productId: number;
  quantity: number;
  discountPercent: number;
}

// Mirrors CreateOrderDialog's new-customer-form + cart + paymentStatus +
// orderChannel state (client/src/pages/orders.tsx). Drafts always create a
// brand-new customer — the bot never has a Bikri customer_id to match against.
export interface OrderPrefill {
  newCustomerName: string;
  newCustomerPhone: string;
  newCustomerAddress: string;
  items: OrderPrefillItem[];
  paymentStatus: 'COD' | 'Bank Transfer/QR';
  orderChannel: 'instagram';
}

export interface PrefillError {
  error: string;
}

// Nepali mobile numbers: 98xxxxxxxx or 97xxxxxxxx, 10 digits.
const PHONE_RE = /^9[678]\d{8}$/;

function findProduct(sku: string, products: PrefillProduct[]): PrefillProduct | undefined {
  const needle = sku.trim().toLowerCase();
  if (!needle) return undefined;
  return products.find((p) => {
    const name = p.name.trim().toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
}

export function mapDraftToOrderPrefill(
  draft: DraftOrderRow,
  products: PrefillProduct[]
): OrderPrefill | PrefillError {
  if (!PHONE_RE.test(draft.phone)) {
    return { error: 'invalid phone' };
  }

  if (!draft.items || draft.items.length === 0) {
    return { error: 'draft has no items' };
  }

  const items: OrderPrefillItem[] = [];
  for (const item of draft.items) {
    const product = findProduct(item.sku, products);
    if (!product) {
      return { error: `unknown product: ${item.sku}` };
    }
    if (product.price !== item.unit_price_cents) {
      return {
        error: `price mismatch on ${item.sku}: bot ${item.unit_price_cents} vs list ${product.price}`,
      };
    }
    items.push({ productId: product.id, quantity: item.qty, discountPercent: 0 });
  }

  return {
    newCustomerName: draft.customer_name,
    newCustomerPhone: draft.phone,
    newCustomerAddress: draft.address,
    items,
    paymentStatus: draft.payment_method === 'cod' ? 'COD' : 'Bank Transfer/QR',
    orderChannel: 'instagram',
  };
}

export function isPrefillError(r: OrderPrefill | PrefillError): r is PrefillError {
  return (r as PrefillError).error !== undefined;
}
