import { wrapEmail } from './base.js';

export interface PaymentReceiptEmailOpts {
  storeName: string;
  orderNumber: string;
  paymentId?: string;
  amount: number;
  paymentMethod?: string;
  cardLast4?: string;
  customerName?: string;
  capturedAt: string;
}

/**
 * Payment-captured receipt email. Sent when a payment is captured for an
 * order — typically this arrives alongside or just after the order-completed
 * receipt but focuses on the payment side of the transaction (card brand,
 * last 4, auth/ref numbers) rather than the itemised basket.
 */
export function paymentReceiptEmailHtml(opts: PaymentReceiptEmailOpts): string {
  const formattedDate = new Date(opts.capturedAt).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const greeting = opts.customerName
    ? `Thank you, ${escHtml(opts.customerName)}!`
    : 'Thank you for your payment!';

  const cardLine = opts.cardLast4
    ? `<p><strong>Card:</strong> ${escHtml(opts.paymentMethod ?? 'Card')} ending in ${escHtml(opts.cardLast4)}</p>`
    : `<p><strong>Payment method:</strong> ${escHtml(opts.paymentMethod ?? 'Card')}</p>`;

  const paymentIdLine = opts.paymentId
    ? `<p class="small"><strong>Reference:</strong> ${escHtml(opts.paymentId)}</p>`
    : '';

  return wrapEmail(`
    <h1>${greeting}</h1>
    <p>We've received your payment for order <strong>#${escHtml(opts.orderNumber)}</strong> from <strong>${escHtml(opts.storeName)}</strong>.</p>

    <div class="info-box">
      <p><strong>Amount paid:</strong> $${opts.amount.toFixed(2)}</p>
      <p><strong>Captured:</strong> ${formattedDate}</p>
      ${cardLine}
      ${paymentIdLine}
    </div>

    <p style="margin-top:24px;">Keep this email for your records. If you asked for a printed receipt in-store, the POS slip from that transaction is the legal tax invoice.</p>

    <p class="small" style="margin-top:24px;">Questions about this payment? Contact ${escHtml(opts.storeName)} or email <a href="mailto:support@elevatedpos.com.au">support@elevatedpos.com.au</a>.</p>
  `);
}

export function paymentReceiptEmailSubject(orderNumber: string, storeName: string): string {
  return `Payment received — #${orderNumber} at ${storeName}`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
