import { Kafka, Producer, logLevel } from 'kafkajs';

let producer: Producer | null = null;

function getKafka(): Kafka {
  return new Kafka({
    clientId: 'nexus-inventory',
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
          headers: { 'content-type': 'application/json', source: 'nexus-inventory' },
        },
      ],
    });
  } catch (err) {
    console.error('[inventory/kafka] Failed to publish event', topic, err);
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
