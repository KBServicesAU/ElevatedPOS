import { startConsumer } from '../lib/kafka.js';
import { handleOrderCreated, handleOrderCompleted, handlePaymentCaptured } from './orderConsumer.js';
import { handleInventoryLowStock } from './inventoryConsumer.js';

async function handleEvent(topic: string, payload: Record<string, unknown>): Promise<void> {
  switch (topic) {
    case 'order.created':
      await handleOrderCreated(payload);
      break;
    case 'order.completed':
      await handleOrderCompleted(payload);
      break;
    case 'payment.captured':
      await handlePaymentCaptured(payload);
      break;
    case 'inventory.low_stock':
      await handleInventoryLowStock(payload);
      break;
    default:
      console.log('[notifications/consumers] Unhandled topic=%s', topic);
  }
}

export async function startConsumers(): Promise<void> {
  if (!process.env['KAFKA_BROKERS']) {
    console.warn('[notifications/consumers] KAFKA_BROKERS not set — Kafka consumers not started');
    return;
  }

  try {
    await startConsumer(handleEvent);
    console.log('[notifications/consumers] All consumers started');
  } catch (err) {
    console.error('[notifications/consumers] Failed to start consumers', err);
  }
}
