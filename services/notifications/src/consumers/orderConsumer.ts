import crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { sendEmail } from '../lib/channels/email.js';
import { receiptEmailHtml, receiptEmailSubject } from '../lib/templates/receipt.js';
import {
  orderConfirmationEmailHtml,
  orderConfirmationEmailSubject,
} from '../lib/templates/orderConfirmation.js';
import {
  paymentReceiptEmailHtml,
  paymentReceiptEmailSubject,
} from '../lib/templates/paymentReceipt.js';

/**
 * Handles order.created — sends order confirmation email to the customer if
 * the event payload contains a customer email address.
 *
 * v2.7.42 — previously this just logged `MOCK EMAIL` and marked the
 * notificationLogs row 'sent' without calling sendEmail. Order
 * confirmations via Kafka never actually reached customers even though
 * the dashboard showed green ticks. Now uses the real Resend-backed
 * sendEmail helper plus the `orderConfirmation` template.
 */
export async function handleOrderCreated(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const orderId =
    (inner['orderId'] as string | undefined) ?? (payload['orderId'] as string | undefined) ?? '';
  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const customerEmail = (inner['customerEmail'] as string | undefined) ??
    (payload['customerEmail'] as string | undefined);
  const customerName =
    (inner['customerName'] as string | undefined) ?? (payload['customerName'] as string | undefined);
  const storeName =
    (inner['storeName'] as string | undefined) ??
    (payload['storeName'] as string | undefined) ??
    'ElevatedPOS Store';
  const total = Number((inner['total'] as number | undefined) ?? 0);
  const orderNumber =
    (inner['orderNumber'] as string | undefined) ??
    (payload['orderNumber'] as string | undefined) ??
    orderId;
  const createdAt = String(
    (inner['createdAt'] as string | undefined) ??
      (payload['createdAt'] as string | undefined) ??
      new Date().toISOString(),
  );

  // Lift the item list (if present) into a light summary for the email.
  const rawItems = (inner['items'] as unknown[] | undefined) ?? [];
  const items = rawItems
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      name: String(i['name'] ?? ''),
      qty: Number(i['qty'] ?? i['quantity'] ?? 1),
    }));

  if (!customerEmail) {
    console.log(
      '[notifications/orderConsumer] order.created has no customerEmail, orderId=%s — skipping confirmation',
      orderId,
    );
    return;
  }

  const subject = orderConfirmationEmailSubject(orderNumber, storeName);
  const htmlBody = orderConfirmationEmailHtml({
    storeName,
    orderNumber,
    ...(customerName !== undefined ? { customerName } : {}),
    total,
    ...(items.length > 0 ? { items } : {}),
    createdAt,
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
      console.log(
        '[notifications/orderConsumer] Order confirmation sent to %s for orderId=%s',
        customerEmail,
        orderId,
      );
    } else {
      console.error(
        '[notifications/orderConsumer] Order confirmation send failed for orderId=%s: %s',
        orderId,
        result.error,
      );
    }
  } catch (err) {
    console.error(
      '[notifications/orderConsumer] Failed to send order confirmation for orderId=%s',
      orderId,
      err,
    );
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
 *
 * v2.7.42 — previously this just logged `MOCK EMAIL` and marked the
 * notificationLogs row 'sent' without calling sendEmail. Payment
 * receipts via Kafka never actually reached customers. Now uses the
 * real Resend-backed sendEmail helper plus the new `paymentReceipt`
 * template (card brand / last 4 / reference number focus).
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
  const customerName =
    (inner['customerName'] as string | undefined) ?? (payload['customerName'] as string | undefined);
  const storeName =
    (inner['storeName'] as string | undefined) ??
    (payload['storeName'] as string | undefined) ??
    'ElevatedPOS Store';
  const orderNumber =
    (inner['orderNumber'] as string | undefined) ??
    (payload['orderNumber'] as string | undefined) ??
    orderId;
  const amount = Number((inner['amount'] as number | undefined) ?? 0);
  const paymentMethod =
    (inner['paymentMethod'] as string | undefined) ??
    (inner['cardType'] as string | undefined) ??
    'Card';
  const cardLast4 =
    (inner['cardLast4'] as string | undefined) ??
    (inner['maskedPan'] as string | undefined)?.slice(-4);
  const capturedAt = String(
    (inner['capturedAt'] as string | undefined) ??
      (inner['completedAt'] as string | undefined) ??
      new Date().toISOString(),
  );

  if (!customerEmail) {
    console.log(
      '[notifications/orderConsumer] payment.captured has no customerEmail, paymentId=%s — skipping receipt',
      paymentId,
    );
    return;
  }

  const subject = paymentReceiptEmailSubject(orderNumber, storeName);
  const htmlBody = paymentReceiptEmailHtml({
    storeName,
    orderNumber,
    ...(paymentId ? { paymentId } : {}),
    amount,
    paymentMethod,
    ...(cardLast4 ? { cardLast4 } : {}),
    ...(customerName !== undefined ? { customerName } : {}),
    capturedAt,
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
      console.log(
        '[notifications/orderConsumer] Payment receipt sent to %s for paymentId=%s',
        customerEmail,
        paymentId,
      );
    } else {
      console.error(
        '[notifications/orderConsumer] Payment receipt send failed for paymentId=%s: %s',
        paymentId,
        result.error,
      );
    }
  } catch (err) {
    console.error(
      '[notifications/orderConsumer] Failed to send payment receipt for paymentId=%s',
      paymentId,
      err,
    );
  }
}
