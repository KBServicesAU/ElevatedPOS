/**
 * Webhook delivery with HMAC-SHA256 signing and exponential-backoff retry.
 *
 * Retry schedule (stored as nextRetryAt in webhook_deliveries):
 *   attempt 1 → +1 min
 *   attempt 2 → +5 min
 *   attempt 3 → +30 min
 *   attempt 4+ → give up
 */

import { createHmac } from 'node:crypto';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db, schema } from '../db';

// v2.7.75 — SSRF guard. Inlined here rather than imported across
// service boundaries because /services/integrations and /services/webhooks
// are independent npm workspaces with no shared lib.
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain',
  'metadata.google.internal', 'metadata.gce.internal', 'metadata',
  'instance-data', 'instance-data.ec2.internal',
]);

function checkOutboundUrl(rawUrl: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return { ok: false, reason: 'invalid url' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol "${parsed.protocol}"` };
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: `host "${host}" not allowed` };
  // Reject IP literals — webhooks must use a hostname.
  if (/:/.test(host) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return { ok: false, reason: 'IP literal not allowed' };
  }
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    return { ok: false, reason: `local-network suffix "${host}" not allowed` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [
  1 * 60 * 1000,   // 1 min
  5 * 60 * 1000,   // 5 min
  30 * 60 * 1000,  // 30 min
];

const DELIVERY_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Signing helper
// ---------------------------------------------------------------------------

export function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Core delivery
// ---------------------------------------------------------------------------

export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  response: string | null;
  error?: string;
}

/**
 * Delivers a single webhook event to the configured URL.
 * Records the attempt in webhook_deliveries and schedules a retry if needed.
 */
export async function deliverWebhook(
  webhookId: string,
  eventType: string,
  payload: unknown,
): Promise<DeliveryResult> {
  const webhook = await db.query.webhooks.findFirst({
    where: eq(schema.webhooks.id, webhookId),
  });

  if (!webhook || !webhook.enabled) {
    return { success: false, statusCode: null, durationMs: 0, response: 'Webhook not found or disabled' };
  }

  return _attemptDelivery(webhookId, webhook.url, webhook.secret, eventType, payload, 0);
}

/**
 * Internal: make the HTTP call and log the result.
 */
async function _attemptDelivery(
  webhookId: string,
  url: string,
  secret: string,
  eventType: string,
  payload: unknown,
  attemptNumber: number,
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);
  const deliveryId = crypto.randomUUID();

  let statusCode: number | null = null;
  let responseText: string | null = null;
  let success = false;
  let errorMsg: string | undefined;
  const start = Date.now();

  // v2.7.75 — SSRF guard. Refuse delivery to any URL that resolves to
  // a private / link-local / IP-literal target. Records the refusal
  // in the delivery row so the dashboard surfaces it as a normal
  // failure rather than a silent skip.
  const ssrf = checkOutboundUrl(url);
  if (!ssrf.ok) {
    errorMsg = `Refused: ${ssrf.reason ?? 'invalid url'}`;
    responseText = errorMsg;
  } else {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ElevatedPOS-Signature': signature,
          'X-ElevatedPOS-Event': eventType,
          'X-ElevatedPOS-Delivery': deliveryId,
          'X-ElevatedPOS-Version': '1',
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      statusCode = res.status;
      responseText = await res.text().catch(() => null);
      success = res.status >= 200 && res.status < 300;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  const durationMs = Date.now() - start;

  // Schedule next retry if delivery failed and we have retries left
  const nextRetryDelay = RETRY_DELAYS_MS[attemptNumber];
  const nextRetryAt =
    !success && nextRetryDelay !== undefined
      ? new Date(Date.now() + nextRetryDelay)
      : null;

  await db.insert(schema.webhookDeliveries).values({
    webhookId,
    event: eventType,
    payload: payload as Record<string, unknown>,
    statusCode,
    response: responseText,
    success,
    durationMs,
    retryCount: attemptNumber,
    nextRetryAt,
    attemptedAt: new Date(),
  });

  return { success, statusCode, durationMs, response: responseText, ...(errorMsg !== undefined ? { error: errorMsg } : {}) };
}

// ---------------------------------------------------------------------------
// Retry polling loop
// ---------------------------------------------------------------------------

/**
 * Processes pending retries. Call this on a setInterval at service boot.
 * Picks up all failed deliveries where nextRetryAt <= now and re-delivers them.
 */
export async function processPendingRetries(): Promise<void> {
  const now = new Date();

  const pending = await db.query.webhookDeliveries.findMany({
    where: and(
      eq(schema.webhookDeliveries.success, false),
      isNotNull(schema.webhookDeliveries.nextRetryAt),
      lte(schema.webhookDeliveries.nextRetryAt, now),
    ),
    limit: 50,
  });

  for (const delivery of pending) {
    const webhook = await db.query.webhooks.findFirst({
      where: eq(schema.webhooks.id, delivery.webhookId),
    });

    if (!webhook || !webhook.enabled) {
      // Clear retry — webhook gone or disabled
      await db
        .update(schema.webhookDeliveries)
        .set({ nextRetryAt: null })
        .where(eq(schema.webhookDeliveries.id, delivery.id));
      continue;
    }

    // Null out nextRetryAt before attempting (prevent double-processing)
    await db
      .update(schema.webhookDeliveries)
      .set({ nextRetryAt: null })
      .where(eq(schema.webhookDeliveries.id, delivery.id));

    const nextAttemptNumber = (delivery.retryCount ?? 0) + 1;

    await _attemptDelivery(
      delivery.webhookId,
      webhook.url,
      webhook.secret,
      delivery.event,
      delivery.payload,
      nextAttemptNumber,
    );
  }
}

/**
 * Starts the retry polling loop. Returns a cleanup function that stops it.
 * Polls every 30 seconds — tight enough to hit the 1-min retry window reliably.
 */
export function startRetryPoller(): () => void {
  const interval = setInterval(() => {
    processPendingRetries().catch((err) => {
      console.error('[webhookDelivery] retry poller error:', err);
    });
  }, 30_000);

  return () => clearInterval(interval);
}
