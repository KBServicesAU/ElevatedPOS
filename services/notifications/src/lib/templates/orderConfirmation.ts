import { wrapEmail } from './base.js';

export interface OrderConfirmationEmailOpts {
  storeName: string;
  orderNumber: string;
  customerName?: string;
  /** Inc-GST total in dollars. */
  total: number;
  /** Optional items list — if provided, a brief itemised summary is included. */
  items?: { name: string; qty: number }[];
  createdAt: string;
}

/**
 * Order-CREATED confirmation email. Sent when we've received an order but
 * haven't completed/charged it yet (typical for online or dine-in). The
 * actual itemised receipt is sent separately on order.completed.
 */
export function orderConfirmationEmailHtml(opts: OrderConfirmationEmailOpts): string {
  const formattedDate = new Date(opts.createdAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const greeting = opts.customerName
    ? `Thanks, ${escHtml(opts.customerName)}!`
    : 'Thanks for your order!';

  const itemsBlock =
    opts.items && opts.items.length > 0
      ? `
        <table style="width:100%;border-collapse:collapse;margin:20px 0 0;">
          <tbody>
            ${opts.items
              .map(
                (i) => `
                  <tr>
                    <td style="padding:8px 0;color:#52525b;font-size:14px;border-bottom:1px solid #f4f4f5;">
                      ${escHtml(i.name)} <span style="color:#a1a1aa;font-size:13px;">&times;${i.qty}</span>
                    </td>
                  </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
      : '';

  return wrapEmail(`
    <h1>${greeting}</h1>
    <p>We've received your order <strong>#${escHtml(opts.orderNumber)}</strong> from <strong>${escHtml(opts.storeName)}</strong>.</p>

    <div class="info-box">
      <p><strong>Order:</strong> #${escHtml(opts.orderNumber)}</p>
      <p><strong>Placed:</strong> ${formattedDate}</p>
      <p><strong>Total:</strong> $${opts.total.toFixed(2)}</p>
    </div>

    ${itemsBlock}

    <p style="margin-top:24px;">You'll get another email with the full receipt once the order is paid and completed.</p>

    <p class="small" style="margin-top:24px;">Questions? Reach out to ${escHtml(opts.storeName)} directly or email <a href="mailto:support@elevatedpos.com.au">support@elevatedpos.com.au</a>.</p>
  `);
}

export function orderConfirmationEmailSubject(orderNumber: string, storeName: string): string {
  return `Order received — #${orderNumber} at ${storeName}`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
