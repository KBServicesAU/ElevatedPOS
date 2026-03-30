import { startOrderConsumer } from './orderConsumer';

export async function startConsumers(): Promise<void> {
  if (!process.env['KAFKA_BROKERS']) {
    console.warn('[inventory/consumers] KAFKA_BROKERS not set — Kafka consumers not started');
    return;
  }

  try {
    await startOrderConsumer();
    console.log('[inventory/consumers] All consumers started');
  } catch (err) {
    console.error('[inventory/consumers] Failed to start consumers', err);
  }
}
