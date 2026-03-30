import type { BaseEvent } from './index';

// ─── Publisher interface ──────────────────────────────────────────────────────

export interface EventPublisher {
  publish(topic: string, event: BaseEvent): Promise<void>;
}

// ─── Kafka publisher (production) ─────────────────────────────────────────────

/**
 * Production publisher backed by a KafkaJS producer.  The producer must
 * already be connected before passing it here.
 */
export class KafkaEventPublisher implements EventPublisher {
  constructor(
    /** A connected KafkaJS Producer instance */
    private readonly producer: {
      send(args: {
        topic: string;
        messages: Array<{ key: string; value: string; headers?: Record<string, string> }>;
      }): Promise<unknown>;
    },
  ) {}

  async publish(topic: string, event: BaseEvent): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key: event.orgId,
          value: JSON.stringify(event),
          headers: {
            'content-type': 'application/json',
            'event-type': event.eventType,
            'event-version': event.version,
            source: 'nexus',
          },
        },
      ],
    });
  }
}

// ─── In-memory publisher (testing) ───────────────────────────────────────────

/**
 * Collects published events in memory.  Useful in unit / integration tests:
 *
 * ```ts
 * const pub = new InMemoryEventPublisher();
 * await pub.publish(EVENT_TOPICS.ORDERS, event);
 * expect(pub.events).toHaveLength(1);
 * ```
 */
export class InMemoryEventPublisher implements EventPublisher {
  public readonly events: Array<{ topic: string; event: BaseEvent }> = [];

  async publish(topic: string, event: BaseEvent): Promise<void> {
    this.events.push({ topic, event });
  }

  /** Clear collected events between test cases */
  clear(): void {
    this.events.length = 0;
  }
}

// ─── No-op publisher (Kafka not configured) ───────────────────────────────────

/**
 * Silently discards events.  Used when KAFKA_BROKERS is not set, so the
 * application starts cleanly in environments without Kafka.
 */
export class NoOpEventPublisher implements EventPublisher {
  async publish(_topic: string, event: BaseEvent): Promise<void> {
    console.debug('[events] no-op publish:', event.eventType);
  }
}

// ─── Factory helpers ─────────────────────────────────────────────────────────

/** Generate a UUID v4 suitable for use as an eventId */
export function createEventId(): string {
  // crypto.randomUUID() is available in Node ≥ 14.17 and all modern browsers
  return crypto.randomUUID();
}

/**
 * Build a fully-formed {@link BaseEvent} envelope around an arbitrary payload.
 *
 * @example
 * ```ts
 * const event = createEvent('order.created', orgId, { orderId, total, ... });
 * await publisher.publish(EVENT_TOPICS.ORDERS, event);
 * ```
 */
export function createEvent<T>(
  eventType: string,
  orgId: string,
  payload: T,
  opts?: { locationId?: string; correlationId?: string },
): BaseEvent<T> {
  return {
    eventId: createEventId(),
    eventType,
    version: '1.0',
    timestamp: new Date().toISOString(),
    orgId,
    ...(opts?.locationId !== undefined && { locationId: opts.locationId }),
    ...(opts?.correlationId !== undefined && { correlationId: opts.correlationId }),
    payload,
  };
}
