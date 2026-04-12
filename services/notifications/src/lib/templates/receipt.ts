import { wrapEmail } from './base.js';

export interface ReceiptEmailOpts {
  storeName: string;
  orderNumber: string;
  customerName?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  gst: number;
  total: number;
  paymentMethod: string;
  completedAt: string;
}

export function receiptEmailHtml(opts: ReceiptEmailOpts): string {
  const formattedDate = new Date(opts.completedAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const itemRows = opts.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;color:#52525b;font-size:14px;border-bottom:1px solid #f4f4f5;">
            ${escHtml(item.name)} <span style="color:#a1a1aa;font-size:13px;">&times;${item.qty}</span>
          </td>
          <td style="padding:10px 0;color:#18181b;font-size:14px;border-bottom:1px solid #f4f4f5;text-align:right;white-space:nowrap;">
            $${(item.price * item.qty).toFixed(2)}
          </td>
        </tr>`,
    )
    .join('');

  const greeting = opts.customerName
    ? `Thank you, ${escHtml(opts.customerName)}!`
    : 'Thank you for your order!';

  return wrapEmail(`
    <h1>${greeting}</h1>
    <p>Here's your receipt for order <strong>#${escHtml(opts.orderNumber)}</strong> from <strong>${escHtml(opts.storeName)}</strong>, placed on ${formattedDate}.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0 0;">
      <tbody>
        ${itemRows}
        <tr>
          <td style="padding:12px 0 4px;color:#52525b;font-size:14px;">Subtotal (ex. GST)</td>
          <td style="padding:12px 0 4px;color:#52525b;font-size:14px;text-align:right;">$${opts.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#52525b;font-size:14px;">GST (10%)</td>
          <td style="padding:4px 0;color:#52525b;font-size:14px;text-align:right;">$${opts.gst.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:12px 0 4px;color:#09090b;font-size:17px;font-weight:700;border-top:2px solid #e4e4e7;">Total</td>
          <td style="padding:12px 0 4px;color:#09090b;font-size:17px;font-weight:700;border-top:2px solid #e4e4e7;text-align:right;">$${opts.total.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="info-box" style="margin-top:20px;">
      <p><strong>Payment method:</strong> ${escHtml(opts.paymentMethod)}</p>
      <p><strong>Store:</strong> ${escHtml(opts.storeName)}</p>
    </div>

    <p class="small" style="margin-top:24px;">If you have any questions about this order, please contact ${escHtml(opts.storeName)} directly or reach out to <a href="mailto:support@elevatedpos.com.au">support@elevatedpos.com.au</a>.</p>
  `);
}

export function receiptEmailSubject(orderNumber: string, storeName: string): string {
  return `Your receipt from ${storeName} — Order #${orderNumber}`;
}

/** Minimal HTML-escape to prevent injection in template interpolation. */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
