import crypto from 'crypto';
import { db, schema } from '../db/index.js';

/**
 * Handles inventory.low_stock — sends an alert notification to org admin users.
 */
export async function handleInventoryLowStock(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const productId =
    (inner['productId'] as string | undefined) ?? (payload['productId'] as string | undefined) ?? '';
  const productName =
    (inner['productName'] as string | undefined) ?? (payload['productName'] as string | undefined) ?? productId;
  const sku = (inner['sku'] as string | undefined) ?? (payload['sku'] as string | undefined) ?? '';
  const currentQty = Number(
    (inner['currentQty'] as number | undefined) ??
    (payload['currentQty'] as number | undefined) ??
    (inner['onHand'] as number | undefined) ??
    0,
  );
  const reorderPoint = Number(
    (inner['reorderPoint'] as number | undefined) ??
    (payload['reorderPoint'] as number | undefined) ??
    (inner['threshold'] as number | undefined) ??
    0,
  );
  const locationId =
    (inner['locationId'] as string | undefined) ?? (payload['locationId'] as string | undefined) ?? '';

  if (!orgId) {
    console.warn('[notifications/inventoryConsumer] inventory.low_stock missing orgId');
    return;
  }

  try {
    const messageId = crypto.randomUUID();
    const subject = `Low Stock Alert — ${productName || productId}`;
    const alertRecipient = process.env['ADMIN_ALERT_EMAIL'] ?? `admin@org-${orgId}.internal`;

    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'email',
      recipient: alertRecipient,
      subject,
      status: 'sent',
      sentAt: new Date(),
    });

    // MOCK alert delivery — replace with real notification channel
    console.log('[notifications/inventoryConsumer] MOCK ALERT — low stock notification sent', {
      messageId,
      to: alertRecipient,
      subject,
      orgId,
      productId,
      productName,
      sku,
      currentQty,
      reorderPoint,
      locationId,
    });
  } catch (err) {
    console.error(
      '[notifications/inventoryConsumer] Failed to send low stock alert for productId=%s',
      productId,
      err,
    );
  }
}
