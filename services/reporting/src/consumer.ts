import { Kafka, type Consumer, type EachMessagePayload, logLevel } from 'kafkajs';
import { ingestOrder } from './ingest.js';

// Subscribes the reporting service to the shared orders topic (`nexus.orders`)
// that `services/orders` publishes to via `publishTypedEvent(EVENT_TOPICS.ORDERS, ...)`.
// The topic carries a mixed stream of typed BaseEvent envelopes; we filter
// on `eventType === 'order.completed'` before ingesting into ClickHouse.

const TOPIC = 'nexus.orders';
const GROUP_ID = 'reporting-service';

let consumer: Consumer | null = null;

/** Best-effort mapping of an OrderCompletedEvent envelope into ingestOrder's shape. */
function mapOrderCompleted(env: Record<string, unknown>): Parameters<typeof ingestOrder>[0] | null {
  const orgId = (env['orgId'] as string | undefined) ?? '';
  const locationId = (env['locationId'] as string | undefined) ?? '';
  const payload = (env['payload'] as Record<string, unknown> | undefined) ?? {};
  const orderId = (payload['orderId'] as string | undefined) ?? '';
  if (!orgId || !orderId) return null;

  const total = Number(payload['total'] ?? 0);
  const gst = Number(payload['gst'] ?? parseFloat((total / 11).toFixed(2)));
  const subtotal = Number(payload['subtotal'] ?? parseFloat((total - gst).toFixed(2)));
  const completedAt = String(payload['completedAt'] ?? (env['timestamp'] as string | undefined) ?? new Date().toISOString());

  // The live envelope omits channel/orderType/discount/createdAt/customerId/employeeId.
  // Use sensible POS defaults so dashboard aggregates (salesToday, totalRevenue,
  // revenueByHour/Channel/Day) populate; a later backfill job can enrich history.
  return {
    id: orderId,
    orgId,
    locationId,
    channel: (payload['channel'] as string | undefined) ?? 'pos',
    orderType: (payload['orderType'] as string | undefined) ?? 'retail',
    ...(payload['customerId'] !== undefined && { customerId: payload['customerId'] as string }),
    ...(payload['employeeId'] !== undefined && { employeeId: payload['employeeId'] as string }),
    subtotal,
    discountTotal: Number(payload['discountTotal'] ?? 0),
    taxTotal: Number(payload['taxTotal'] ?? gst),
    total,
    completedAt,
    createdAt: String(payload['createdAt'] ?? completedAt),
    // `items` in the event only has {name, qty, price}; without productId we
    // cannot populate order_lines_fact reliably, so we skip it. Top-products
    // will stay empty from the live stream until orders publishes richer lines.
  };
}

export async function startKafkaConsumer(): Promise<void> {
  if (!process.env['KAFKA_BROKERS']) {
    console.warn('[reporting/consumer] KAFKA_BROKERS not set — Kafka consumer not started');
    return;
  }

  const kafka = new Kafka({
    clientId: 'elevatedpos-reporting',
    brokers: process.env['KAFKA_BROKERS'].split(','),
    logLevel: logLevel.WARN,
  });

  consumer = kafka.consumer({ groupId: GROUP_ID, sessionTimeout: 30_000, heartbeatInterval: 3_000 });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      if (!message.value) return;
      try {
        const env = JSON.parse(message.value.toString()) as Record<string, unknown>;
        if (env['eventType'] !== 'order.completed') return;
        const order = mapOrderCompleted(env);
        if (!order) {
          console.warn('[reporting/consumer] dropping order.completed with missing orgId/orderId');
          return;
        }
        await ingestOrder(order);
      } catch (err) {
        console.error('[reporting/consumer] failed to process message on topic=%s', topic, err);
      }
    },
  });

  console.log('[reporting/consumer] subscribed to %s (group=%s)', TOPIC, GROUP_ID);
}

export async function stopKafkaConsumer(): Promise<void> {
  if (consumer) {
    try { await consumer.disconnect(); } catch { /* ignore */ }
    consumer = null;
  }
}
