import { createHmac, timingSafeEqual } from 'node:crypto';
import { NexusWebhookSignatureError } from './errors.js';
import type { NexusEvent, NexusEventType } from './types.js';

type EventHandler<T extends NexusEvent = NexusEvent> = (event: T) => void | Promise<void>;

/**
 * WebhookHandler verifies ElevatedPOS webhook signatures and dispatches events
 * to type-safe handlers.
 *
 * @example
 * ```ts
 * const handler = new WebhookHandler(process.env.ELEVATEDPOS_WEBHOOK_SECRET!);
 *
 * handler.on('order.completed', async (event) => {
 *   console.log('Order completed:', event.data.order.orderNumber);
 * });
 *
 * // In your Express/Fastify route:
 * const rawBody = await req.text();
 * const signature = req.headers['x-elevatedpos-signature'];
 * const timestamp = req.headers['x-elevatedpos-timestamp'];
 * await handler.handle(rawBody, signature, timestamp);
 * ```
 */

/** Maximum age of a webhook timestamp before it is rejected (5 minutes). */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

export class WebhookHandler {
  private readonly secret: string;
  private readonly handlers = new Map<NexusEventType, EventHandler[]>();

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Verifies an HMAC-SHA256 webhook signature including timestamp freshness.
   * The signed content is `${timestamp}.${payload}`.
   * Uses timing-safe comparison to prevent timing attacks.
   *
   * @param payload   - Raw JSON string body of the webhook
   * @param signature - Value of the `x-elevatedpos-signature` header (`sha256=<hex>`)
   * @param timestamp - Unix millisecond timestamp string from the signing process
   */
  verifySignature(payload: string, signature: string, timestamp: string): boolean {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;

    // Reject webhooks older than MAX_TIMESTAMP_AGE_MS to prevent replay attacks
    if (Math.abs(Date.now() - ts) > MAX_TIMESTAMP_AGE_MS) return false;

    const expected = createHmac('sha256', this.secret)
      .update(`${ts}.${payload}`, 'utf8')
      .digest('hex');

    // Support "sha256=<hex>" prefix format
    const incoming = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    if (expected.length !== incoming.length) return false;

    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(incoming, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Verifies the signature and parses a raw webhook payload into a typed NexusEvent.
   * Throws NexusWebhookSignatureError if the signature is invalid.
   * Throws if the payload is not valid JSON or missing required fields.
   *
   * @param payload   - Raw JSON string body of the webhook
   * @param signature - Value of the `x-elevatedpos-signature` header
   * @param timestamp - Unix millisecond timestamp string
   */
  parseEvent(payload: string, signature: string, timestamp: string): NexusEvent {
    if (!this.verifySignature(payload, signature, timestamp)) {
      throw new NexusWebhookSignatureError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error('Webhook payload is not valid JSON');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Webhook payload must be a JSON object');
    }

    const event = parsed as Record<string, unknown>;

    if (!event['id'] || !event['type'] || !event['merchantId'] || !event['timestamp'] || !event['data']) {
      throw new Error('Webhook payload is missing required fields: id, type, merchantId, timestamp, data');
    }

    return event as unknown as NexusEvent;
  }

  /**
   * Registers a type-safe handler for a specific event type.
   */
  on<T extends NexusEventType>(
    eventType: T,
    handler: EventHandler<Extract<NexusEvent, { type: T }>>,
  ): this {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(eventType, existing);
    return this;
  }

  /**
   * Removes a previously registered handler.
   */
  off<T extends NexusEventType>(
    eventType: T,
    handler: EventHandler<Extract<NexusEvent, { type: T }>>,
  ): this {
    const existing = this.handlers.get(eventType);
    if (existing) {
      this.handlers.set(
        eventType,
        existing.filter((h) => h !== handler),
      );
    }
    return this;
  }

  /**
   * Verifies the signature, parses the event, and dispatches to registered handlers.
   * Throws NexusWebhookSignatureError if the signature is invalid.
   *
   * @param payload   - Raw JSON string body of the webhook
   * @param signature - Value of the `x-elevatedpos-signature` header
   * @param timestamp - Unix millisecond timestamp string
   */
  async handle(payload: string, signature: string, timestamp: string): Promise<NexusEvent> {
    const event = this.parseEvent(payload, signature, timestamp);
    const handlers = this.handlers.get(event.type as NexusEventType) ?? [];

    await Promise.all(handlers.map((h) => h(event)));

    return event;
  }

  /**
   * Convenience method: verifies and parses without dispatching to handlers.
   *
   * @param payload   - Raw JSON string body of the webhook
   * @param signature - Value of the `x-elevatedpos-signature` header
   * @param timestamp - Unix millisecond timestamp string
   */
  verify(payload: string, signature: string, timestamp: string): NexusEvent {
    return this.parseEvent(payload, signature, timestamp);
  }
}
