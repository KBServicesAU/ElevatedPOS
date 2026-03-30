import crypto from 'crypto';
import { db, schema } from '../db/index.js';

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
