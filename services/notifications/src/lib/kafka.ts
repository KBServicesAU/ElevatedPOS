import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';

const TOPICS = [
  'order.created',
  'order.completed',
  'order.cancelled',
  'payment.captured',
  'payment.failed',
  'customer.created',
  'loyalty.tier_changed',
  'inventory.low_stock',
] as const;

type NotificationHandler = (topic: string, payload: Record<string, unknown>) => Promise<void>;

let consumer: Consumer | null = null;

export async function startConsumer(handler: NotificationHandler): Promise<void> {
  const kafka = new Kafka({
    clientId: 'elevatedpos-notifications',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });

  consumer = kafka.consumer({
    groupId: 'elevatedpos-notifications-group',
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  });

  await consumer.connect();

  for (const topic of TOPICS) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      if (!message.value) return;
      try {
        const payload = JSON.parse(message.value.toString()) as Record<string, unknown>;
        await handler(topic, payload);
      } catch (err) {
        console.error('[notifications/kafka] Failed to process message', topic, err);
      }
    },
  });

  console.log('[notifications/kafka] Consumer started, subscribed to', TOPICS.join(', '));
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
}
