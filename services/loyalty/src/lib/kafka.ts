import { Kafka, Producer, Consumer, EachMessagePayload, logLevel } from 'kafkajs';

let producer: Producer | null = null;

function getKafka(): Kafka {
  return new Kafka({
    clientId: 'elevatedpos-loyalty',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });
}

export async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  const kafka = getKafka();
  producer = kafka.producer({ allowAutoTopicCreation: true });
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
          headers: { 'content-type': 'application/json', source: 'elevatedpos-loyalty' },
        },
      ],
    });
  } catch (err) {
    console.error('[loyalty/kafka] Failed to publish event', topic, err);
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
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
        console.error('[loyalty/kafka] Failed to process message', topic, err);
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
