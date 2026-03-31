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
 * const handler = new WebhookHandler({ secret: process.env.ELEVATEDPOS_WEBHOOK_SECRET });
 *
 * handler.on('order.completed', async (event) => {
 *   console.log('Order completed:', event.data.order.orderNumber);
 * });
 *
 * // In your Express/Fastify route:
 * const rawBody = await req.text();
 * const signature = req.headers['x-elevatedpos-signature'];
 * await handler.handle(rawBody, signature);
 * ```
 */
export class WebhookHandler {
  private readonly secret: string;
  private readonly handlers = new Map<NexusEventType, EventHandler[]>();

  constructor(options: { secret: string }) {
    this.secret = options.secret;
  }

  /**
   * Verifies an HMAC-SHA256 webhook signature.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  verifySignature(payload: string, signature: string): boolean {
    const expected = createHmac('sha256', this.secret)
      .update(payload, 'utf8')
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
   * Parses a raw webhook payload into a typed NexusEvent.
   * Throws if the payload is not valid JSON or missing required fields.
   */
  parseEvent(payload: string): NexusEvent {
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
   */
  async handle(payload: string, signature: string): Promise<NexusEvent> {
    if (!this.verifySignature(payload, signature)) {
      throw new NexusWebhookSignatureError();
    }

    const event = this.parseEvent(payload);
    const handlers = this.handlers.get(event.type as NexusEventType) ?? [];

    await Promise.all(handlers.map((h) => h(event)));

    return event;
  }

  /**
   * Convenience method: verifies and parses without dispatching to handlers.
   */
  verify(payload: string, signature: string): NexusEvent {
    if (!this.verifySignature(payload, signature)) {
      throw new NexusWebhookSignatureError();
    }
    return this.parseEvent(payload);
  }
}
