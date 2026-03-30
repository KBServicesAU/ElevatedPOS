import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';

function getKafka(): Kafka {
  return new Kafka({
    clientId: 'nexus-campaigns',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });
}

type MessageHandler = (topic: string, payload: Record<string, unknown>) => Promise<void>;

const activeConsumers: Consumer[] = [];

export async function createConsumer(
  groupId: string,
  topics: string[],
  handler: MessageHandler,
): Promise<Consumer> {
  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId, sessionTimeout: 30_000, heartbeatInterval: 3_000 });
  await consumer.connect();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      if (!message.value) return;
      try {
        const payload = JSON.parse(message.value.toString()) as Record<string, unknown>;
        await handler(topic, payload);
      } catch (err) {
        console.error('[campaigns/kafka] Failed to process message', topic, err);
      }
    },
  });
  activeConsumers.push(consumer);
  return consumer;
}

export async function disconnectAllConsumers(): Promise<void> {
  for (const c of activeConsumers) {
    try { await c.disconnect(); } catch { /* ignore */ }
  }
  activeConsumers.length = 0;
}
