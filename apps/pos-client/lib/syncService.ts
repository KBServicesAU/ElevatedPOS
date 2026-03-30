import { getPendingEvents, markSynced, markFailed, getUnsyncedOrders } from './offlineQueue';
import { posApiFetch } from './api';

export async function syncPendingEvents(): Promise<{ synced: number; failed: number }> {
  const events = getPendingEvents();
  let synced = 0;
  let failed = 0;

  for (const event of events) {
    if (event.retry_count >= 5) {
      failed++;
      continue;
    }
    try {
      const payload = JSON.parse(event.payload) as unknown;
      await posApiFetch('/api/v1/sync/events', {
        method: 'POST',
        body: JSON.stringify({ type: event.event_type, payload, clientEventId: event.id }),
      });
      markSynced(event.id);
      synced++;
    } catch (err) {
      markFailed(event.id, String(err));
      failed++;
    }
  }

  return { synced, failed };
}

export async function syncUnsyncedOrders(): Promise<{ synced: number }> {
  const orders = getUnsyncedOrders();
  let synced = 0;
  for (const order of orders) {
    try {
      await posApiFetch('/api/v1/orders', { method: 'POST', body: order.data });
      synced++;
    } catch {
      // keep in queue for next sync attempt
    }
  }
  return { synced };
}
