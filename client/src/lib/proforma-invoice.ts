// Pro forma invoice generator.
// Opens a print-ready window; the browser's print dialog lets the user save
// it as a PDF. No PDF library needed, works fully offline.

type ProFormaOrder = {
  id: number;
  order_date: string;
  vat_bill_number: string | null;
  total_amount: number;
  delivery_fee: number;
  note: string | null;
  payment_status: string;
  customer?: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    pan_vat_number?: string | null;
  };
  items?: {
    quantity: number;
    unit_price: number;
    discount: number;
    product?: { name?: string };
    variant?: { name?: string } | null;
    product_id: number;
  }[];
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function openProFormaInvoice(
  order: ProFormaOrder,
  businessName: string,
  formatCurrency: (cents: number) => string,
) {
  const items = order.items || [];
  const orderDate = new Date(order.order_date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const rowsHtml = items.map((item, i) => {
    const name = item.variant?.name
      ? `${item.product?.name || `Product #${item.product_id}`} — ${item.variant.name}`
      : (item.product?.name || `Product #${item.product_id}`);
    const effectivePrice = item.unit_price - (item.discount || 0);
    const lineTotal = effectivePrice * item.quantity;
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(name)}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${esc(formatCurrency(item.unit_price))}</td>
      <td class="num">${item.discount > 0 ? esc(formatCurrency(item.discount)) : '-'}</td>
      <td class="num">${esc(formatCurrency(lineTotal))}</td>
    </tr>`;
  }).join('');

  const itemsSubtotal = items.reduce((sum, item) => sum + (item.unit_price - (item.discount || 0)) * item.quantity, 0);
  const deliveryFee = order.delivery_fee || 0;

  // VAT breakdown mirrors the in-app VAT Calculations dialog: prices are
  // VAT-inclusive, so the taxable amount is subtotal / 1.13.
  const hasVat = !!order.vat_bill_number;
  const taxable = Math.round(itemsSubtotal / 1.13);
  const vatAmount = itemsSubtotal - taxable;

  const totalsHtml = hasVat
    ? `<tr><td>Taxable Amount</td><td class="num">${esc(formatCurrency(taxable))}</td></tr>
       <tr><td>VAT @ 13%</td><td class="num">${esc(formatCurrency(vatAmount))}</td></tr>
       ${deliveryFee > 0 ? `<tr><td>Delivery Fee</td><td class="num">${esc(formatCurrency(deliveryFee))}</td></tr>` : ''}
       <tr class="grand"><td>Grand Total</td><td class="num">${esc(formatCurrency(itemsSubtotal + deliveryFee))}</td></tr>`
    : `<tr><td>Subtotal</td><td class="num">${esc(formatCurrency(itemsSubtotal))}</td></tr>
       ${deliveryFee > 0 ? `<tr><td>Delivery Fee</td><td class="num">${esc(formatCurrency(deliveryFee))}</td></tr>` : ''}
       <tr class="grand"><td>Grand Total</td><td class="num">${esc(formatCurrency(itemsSubtotal + deliveryFee))}</td></tr>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Pro Forma Invoice — Order #${order.id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .biz-name { font-size: 22px; font-weight: 700; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 18px; letter-spacing: 2px; }
  .doc-title .muted { color: #666; font-size: 12px; margin-top: 4px; }
  .disclaimer { background: #fef9e7; border: 1px solid #f0e0a0; border-radius: 4px; padding: 8px 12px; font-size: 11px; color: #8a6d00; margin-bottom: 24px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 24px; }
  .meta .block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  .meta .block div { line-height: 1.5; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  table.items th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #ddd; padding: 8px 6px; }
  table.items td { padding: 8px 6px; border-bottom: 1px solid #eee; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  table.items th.num { text-align: right; }
  table.totals { margin-left: auto; width: 300px; border-collapse: collapse; }
  table.totals td { padding: 6px; }
  table.totals tr.grand td { border-top: 2px solid #1a1a1a; font-weight: 700; font-size: 15px; }
  .note { margin-top: 24px; font-size: 12px; color: #555; }
  .footer { margin-top: 48px; display: flex; justify-content: space-between; font-size: 12px; color: #888; }
  .sig { border-top: 1px solid #999; padding-top: 6px; width: 200px; text-align: center; }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #1a1a1a; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  @media print { .print-btn { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
<div class="header">
  <div>
    <div class="biz-name">${esc(businessName)}</div>
  </div>
  <div class="doc-title">
    <h1>PRO FORMA INVOICE</h1>
    <div class="muted">Ref: PF-${order.id}</div>
    <div class="muted">Date: ${esc(orderDate)}</div>
  </div>
</div>

<div class="disclaimer">
  This is a pro forma invoice issued for quotation/confirmation purposes only. It is not a tax invoice and does not demand payment.
</div>

<div class="meta">
  <div class="block">
    <h3>Bill To</h3>
    <div><strong>${esc(order.customer?.name || '-')}</strong></div>
    ${order.customer?.address ? `<div>${esc(order.customer.address)}</div>` : ''}
    ${order.customer?.phone ? `<div>${esc(order.customer.phone)}</div>` : ''}
    ${order.customer?.pan_vat_number ? `<div>PAN/VAT: ${esc(order.customer.pan_vat_number)}</div>` : ''}
  </div>
  <div class="block" style="text-align:right">
    <h3>Details</h3>
    <div>Order #${order.id}</div>
    <div>Payment: ${esc(order.payment_status)}</div>
    ${order.vat_bill_number ? `<div>VAT Bill #: ${esc(order.vat_bill_number)}</div>` : ''}
  </div>
</div>

<table class="items">
  <thead>
    <tr>
      <th>#</th>
      <th>Item</th>
      <th class="num">Qty</th>
      <th class="num">Unit Price</th>
      <th class="num">Discount</th>
      <th class="num">Amount</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>

<table class="totals">${totalsHtml}</table>

${order.note ? `<div class="note"><strong>Note:</strong> ${esc(order.note)}</div>` : ''}

<div class="footer">
  <div>Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  <div class="sig">Authorised Signature</div>
</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
