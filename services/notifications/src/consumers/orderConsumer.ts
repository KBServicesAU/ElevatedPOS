import crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { sendEmail } from '../lib/channels/email.js';
import { receiptEmailHtml, receiptEmailSubject } from '../lib/templates/receipt.js';

/**
 * Handles order.created — sends order confirmation email to the customer if
 * the event payload contains a customer email address.
 */
export async function handleOrderCreated(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const orderId =
    (inner['orderId'] as string | undefined) ?? (payload['orderId'] as string | undefined) ?? '';
  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const customerEmail = (inner['customerEmail'] as string | undefined) ??
    (payload['customerEmail'] as string | undefined);
  const total = Number((inner['total'] as number | undefined) ?? 0);
  const orderNumber =
    (inner['orderNumber'] as string | undefined) ?? (payload['orderNumber'] as string | undefined);

  if (!customerEmail) {
    // No customer email in event — nothing to send
    console.log('[notifications/orderConsumer] order.created has no customerEmail, orderId=%s — skipping confirmation', orderId);
    return;
  }

  try {
    const messageId = crypto.randomUUID();
    const subject = `Order Confirmation — ${orderNumber ?? orderId}`;

    console.log('[notifications/orderConsumer] Sending order confirmation to %s for orderId=%s', customerEmail, orderId);

    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'email',
      recipient: customerEmail,
      subject,
      status: 'sent',
      sentAt: new Date(),
    });

    // MOCK SMTP — replace with real mailer integration
    console.log('[notifications/orderConsumer] MOCK EMAIL — order confirmation sent', {
      messageId,
      to: customerEmail,
      subject,
      orderId,
      total,
    });
  } catch (err) {
    console.error('[notifications/orderConsumer] Failed to send order confirmation for orderId=%s', orderId, err);
  }
}

/**
 * Handles order.completed — sends a full itemised receipt email to the customer.
 *
 * Expected payload fields (all optional — handler degrades gracefully):
 *   orderId, orderNumber, customerEmail, customerName, storeName,
 *   items[]{name,qty,price}, subtotal, gst, total, paymentMethod, completedAt
 */
export async function handleOrderCompleted(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const orderId =
    (inner['orderId'] as string | undefined) ?? (payload['orderId'] as string | undefined) ?? '';
  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const customerEmail =
    (inner['customerEmail'] as string | undefined) ?? (payload['customerEmail'] as string | undefined);
  const customerName =
    (inner['customerName'] as string | undefined) ?? (payload['customerName'] as string | undefined);
  const storeName =
    (inner['storeName'] as string | undefined) ?? (payload['storeName'] as string | undefined) ?? 'ElevatedPOS Store';
  const orderNumber =
    (inner['orderNumber'] as string | undefined) ?? (payload['orderNumber'] as string | undefined) ?? orderId;

  if (!customerEmail) {
    console.log(
      '[notifications/orderConsumer] order.completed has no customerEmail, orderId=%s — skipping receipt',
      orderId,
    );
    return;
  }

  const rawItems = (inner['items'] as unknown[] | undefined) ?? [];
  const items: { name: string; qty: number; price: number }[] = rawItems
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      name: String(i['name'] ?? ''),
      qty: Number(i['qty'] ?? i['quantity'] ?? 1),
      price: Number(i['price'] ?? i['unitPrice'] ?? 0),
    }));

  const total = Number((inner['total'] as number | undefined) ?? 0);
  // GST is 1/11th of the GST-inclusive total (Australian 10% GST)
  const gst = Number((inner['gst'] as number | undefined) ?? parseFloat((total / 11).toFixed(2)));
  const subtotal = Number(
    (inner['subtotal'] as number | undefined) ?? parseFloat((total - gst).toFixed(2)),
  );
  const paymentMethod = String((inner['paymentMethod'] as string | undefined) ?? 'Card');
  const completedAt = String(
    (inner['completedAt'] as string | undefined) ?? new Date().toISOString(),
  );

  const subject = receiptEmailSubject(orderNumber, storeName);
  const htmlBody = receiptEmailHtml({
    storeName,
    orderNumber,
    ...(customerName !== undefined ? { customerName } : {}),
    items,
    subtotal,
    gst,
    total,
    paymentMethod,
    completedAt,
  });

  try {
    const result = await sendEmail({ to: customerEmail, subject, htmlBody, orgId });

    const messageId = result.messageId ?? crypto.randomUUID();
    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'email',
      recipient: customerEmail,
      subject,
      status: result.success ? 'sent' : 'failed',
      ...(result.success ? { sentAt: new Date() } : { errorMessage: result.error ?? null }),
    });

    if (result.success) {
      console.log('[notifications/orderConsumer] Receipt sent to %s for orderId=%s', customerEmail, orderId);
    } else {
      console.error(
        '[notifications/orderConsumer] Receipt send failed for orderId=%s: %s',
        orderId,
        result.error,
      );
    }
  } catch (err) {
    console.error('[notifications/orderConsumer] Failed to send receipt for orderId=%s', orderId, err);
  }
}

/**
 * Handles payment.captured — sends payment receipt email.
 */
export async function handlePaymentCaptured(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const paymentId =
    (inner['paymentId'] as string | undefined) ?? (payload['paymentId'] as string | undefined) ?? '';
  const orderId =
    (inner['orderId'] as string | undefined) ?? (payload['orderId'] as string | undefined) ?? '';
  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const customerEmail = (inner['customerEmail'] as string | undefined) ??
    (payload['customerEmail'] as string | undefined);
  const amount = Number((inner['amount'] as number | undefined) ?? 0);

  if (!customerEmail) {
    console.log('[notifications/orderConsumer] payment.captured has no customerEmail, paymentId=%s — skipping receipt', paymentId);
    return;
  }

  try {
    const messageId = crypto.randomUUID();
    const subject = `Payment Receipt — Order ${orderId}`;

    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'email',
      recipient: customerEmail,
      subject,
      status: 'sent',
      sentAt: new Date(),
    });

    // MOCK SMTP — replace with real mailer integration
    console.log('[notifications/orderConsumer] MOCK EMAIL — receipt sent', {
      messageId,
      to: customerEmail,
      subject,
      paymentId,
      orderId,
      amount,
    });
  } catch (err) {
    console.error('[notifications/orderConsumer] Failed to send receipt for paymentId=%s', paymentId, err);
  }
}
