import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';

export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  response: string | null;
}

/**
 * Signs a webhook payload using HMAC-SHA256.
 */
export function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Delivers a webhook event to the configured URL.
 * Records the delivery attempt in webhook_deliveries.
 */
export async function deliverWebhook(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  const webhook = await db.query.webhooks.findFirst({
    where: eq(schema.webhooks.id, webhookId),
  });

  if (!webhook || !webhook.enabled) {
    return { success: false, statusCode: null, response: 'Webhook not found or disabled' };
  }

  const body = JSON.stringify(payload);
  const signature = signPayload(body, webhook.secret);

  let statusCode: number | null = null;
  let responseText: string | null = null;
  let success = false;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Signature': signature,
        'X-Nexus-Event': event,
        'X-Nexus-Delivery': crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    statusCode = res.status;
    responseText = await res.text().catch(() => null);
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    responseText = err instanceof Error ? err.message : 'Unknown error';
  }

  // Record delivery attempt
  await db.insert(schema.webhookDeliveries).values({
    webhookId,
    event,
    payload,
    statusCode,
    response: responseText,
    success,
    attemptedAt: new Date(),
  });

  return { success, statusCode, response: responseText };
}
