import { startOrderConsumer } from './orderConsumer.js';
import { startCustomerConsumer } from './customerConsumer.js';

export async function startConsumers(): Promise<void> {
  if (!process.env['KAFKA_BROKERS']) {
    console.warn('[loyalty/consumers] KAFKA_BROKERS not set — Kafka consumers not started');
    return;
  }

  try {
    await startOrderConsumer();
    await startCustomerConsumer();
    console.log('[loyalty/consumers] All consumers started');
  } catch (err) {
    console.error('[loyalty/consumers] Failed to start consumers', err);
  }
}
