/**
 * Webhook delivery with HMAC-SHA256 signing and retry scheduling.
 *
 * Retry schedule (nextRetryAt):
 *   attempt 1 → +1 min
 *   attempt 2 → +5 min
 *   attempt 3 → +30 min
 *   attempt 4+ → give up (status: failed)
 *
 * Max attempts: 3 retries = 4 total attempts
 */

import { createHmac } from 'node:crypto';
import { and, eq, lte, inArray } from 'drizzle-orm';
import { db, schema } from '../db';

const RETRY_DELAYS_MS = [
  1 * 60 * 1000,   // 1 min
  5 * 60 * 1000,   // 5 min
  30 * 60 * 1000,  // 30 min
];

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeliveryResult {
  success: boolean;
  responseCode: number | null;
  responseBody: string | null;
}

export type WebhookEndpoint = typeof schema.webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof schema.webhookDeliveries.$inferSelect;

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

function signPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Single delivery attempt
// ---------------------------------------------------------------------------

/**
 * Makes a POST request to the endpoint URL with HMAC signing headers.
 * Returns the raw HTTP result — does not update DB.
 */
export async function deliverWebhook(
  delivery: WebhookDelivery,
  endpoint: WebhookEndpoint,
): Promise<DeliveryResult> {
  const body = JSON.stringify(delivery.payload);
  const signature = signPayload(body, endpoint.secret);

  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexus-Event': delivery.event,
          'X-Nexus-Signature': signature,
          'X-Nexus-Delivery': delivery.id,
        },
        body,
        signal: controller.signal,
      });

      responseCode = res.status;
      responseBody = await res.text().catch(() => null);
      success = res.status >= 200 && res.status < 300;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Timeout or network error — leave responseCode null, success = false
  }

  return { success, responseCode, responseBody };
}

// ---------------------------------------------------------------------------
// Polling loop — processes pending/retrying deliveries
// ---------------------------------------------------------------------------

/**
 * Finds all pending/retrying deliveries where nextRetryAt <= now,
 * attempts delivery, and updates status / schedules next retry.
 */
export async function processDeliveries(): Promise<void> {
  const now = new Date();

  const pending = await db.query.webhookDeliveries.findMany({
    where: and(
      inArray(schema.webhookDeliveries.status, ['pending', 'retrying']),
      lte(schema.webhookDeliveries.nextRetryAt, now),
    ),
    limit: 100,
  });

  for (const delivery of pending) {
    const endpoint = await db.query.webhookEndpoints.findFirst({
      where: eq(schema.webhookEndpoints.id, delivery.endpointId),
    });

    if (!endpoint || endpoint.status !== 'active') {
      // Endpoint gone or disabled — mark failed, clear retry
      await db
        .update(schema.webhookDeliveries)
        .set({ status: 'failed', nextRetryAt: null })
        .where(eq(schema.webhookDeliveries.id, delivery.id));
      continue;
    }

    // Null out nextRetryAt before attempting to prevent double-processing
    await db
      .update(schema.webhookDeliveries)
      .set({ nextRetryAt: null })
      .where(eq(schema.webhookDeliveries.id, delivery.id));

    const result = await deliverWebhook(delivery, endpoint);
    const newAttemptCount = (delivery.attemptCount ?? 0) + 1;

    if (result.success) {
      await db
        .update(schema.webhookDeliveries)
        .set({
          status: 'success',
          responseCode: result.responseCode,
          responseBody: result.responseBody,
          attemptCount: newAttemptCount,
          nextRetryAt: null,
          deliveredAt: new Date(),
        })
        .where(eq(schema.webhookDeliveries.id, delivery.id));
    } else {
      const retryDelay = RETRY_DELAYS_MS[newAttemptCount - 1];
      const hasRetryLeft = newAttemptCount < MAX_ATTEMPTS && retryDelay !== undefined;

      await db
        .update(schema.webhookDeliveries)
        .set({
          status: hasRetryLeft ? 'retrying' : 'failed',
          responseCode: result.responseCode,
          responseBody: result.responseBody,
          attemptCount: newAttemptCount,
          nextRetryAt: hasRetryLeft ? new Date(Date.now() + retryDelay) : null,
        })
        .where(eq(schema.webhookDeliveries.id, delivery.id));
    }
  }
}
