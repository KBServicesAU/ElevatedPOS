import { Kafka, Producer, logLevel } from 'kafkajs';
import type { BaseEvent } from '@nexus/event-schemas';

let producer: Producer | null = null;

function getKafka(): Kafka {
  return new Kafka({
    clientId: 'elevatedpos-orders',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });
}

export async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  const kafka = getKafka();
  producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30_000,
  });
  await producer.connect();
  return producer;
}

export async function publishEvent(topic: string, payload: object): Promise<void> {
  try {
    const p = await getProducer();
    await p.send({
      topic,
      messages: [
        {
          key: (payload as Record<string, string>)['id'] ?? String(Date.now()),
          value: JSON.stringify(payload),
          headers: {
            'content-type': 'application/json',
            source: 'elevatedpos-orders',
            timestamp: String(Date.now()),
          },
        },
      ],
    });
  } catch (err) {
    // Non-fatal: log but don't fail the request
    console.error('[orders/kafka] Failed to publish event', topic, err);
  }
}

/**
 * Publish a fully-formed {@link BaseEvent} envelope to the given Kafka topic.
 * Uses `orgId` as the partition key and attaches standard ElevatedPOS headers.
 * Failures are non-fatal — errors are logged but never propagated to callers.
 */
export async function publishTypedEvent(topic: string, event: BaseEvent): Promise<void> {
  try {
    const p = await getProducer();
    await p.send({
      topic,
      messages: [
        {
          key: event.orgId,
          value: JSON.stringify(event),
          headers: {
            'content-type': 'application/json',
            'event-type': event.eventType,
            'event-version': event.version,
            'event-id': event.eventId,
            source: 'elevatedpos-orders',
          },
        },
      ],
    });
  } catch (err) {
    // Non-fatal: Kafka may be unavailable in dev/test — log and continue
    console.error('[orders/kafka] Failed to publish typed event', topic, event.eventType, err);
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
