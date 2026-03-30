import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { createConsumer, publishEvent } from '../lib/kafka';

const GROUP_ID = 'inventory-service';
const LOW_STOCK_THRESHOLD = Number(process.env['LOW_STOCK_THRESHOLD'] ?? 5);

interface OrderCreatedPayload {
  payload?: {
    orderId?: string;
    lineCount?: number;
    channel?: string;
    customerId?: string;
  };
  // flat shape (legacy publishEvent path)
  orderId?: string;
  orgId?: string;
  locationId?: string;
  items?: Array<{ productId: string; quantity: number }>;
  // typed envelope shape
  eventType?: string;
}

async function handleOrderCreated(raw: Record<string, unknown>): Promise<void> {
  // Support both the typed BaseEvent envelope (eventType + payload) and flat shapes
  const envelope = raw as OrderCreatedPayload;

  // Extract orgId and locationId from the envelope
  const orgId = (raw['orgId'] as string | undefined) ?? '';
  const locationId = (raw['locationId'] as string | undefined) ?? '';
  const orderId =
    (envelope.payload?.orderId as string | undefined) ??
    (raw['orderId'] as string | undefined) ??
    '';

  // Items may be nested inside payload or at the top level
  const items = (raw['items'] as Array<{ productId: string; quantity: number }> | undefined) ?? [];

  if (!items.length) {
    console.warn('[inventory/orderConsumer] order.created event has no items, orderId=%s', orderId);
    return;
  }

  for (const item of items) {
    try {
      const stockItem = await db.query.stockItems.findFirst({
        where: and(
          eq(schema.stockItems.productId, item.productId),
          locationId ? eq(schema.stockItems.locationId, locationId) : undefined,
        ),
      });

      if (!stockItem) {
        console.warn(
          '[inventory/orderConsumer] No stock record for productId=%s locationId=%s — skipping',
          item.productId,
          locationId,
        );
        continue;
      }

      const currentQty = Number(stockItem.onHand);
      const newQty = currentQty - item.quantity;

      await db
        .update(schema.stockItems)
        .set({ onHand: String(newQty), updatedAt: new Date() })
        .where(eq(schema.stockItems.id, stockItem.id));

      // Publish low_stock event if quantity falls below reorder threshold
      if (newQty <= LOW_STOCK_THRESHOLD && currentQty > LOW_STOCK_THRESHOLD) {
        await publishEvent('inventory.low_stock', {
          orgId,
          locationId: stockItem.locationId,
          productId: stockItem.productId,
          variantId: stockItem.variantId,
          currentQty: newQty,
          reorderPoint: LOW_STOCK_THRESHOLD,
          timestamp: new Date().toISOString(),
        });
        console.log(
          '[inventory/orderConsumer] Low stock alert published for productId=%s qty=%d',
          item.productId,
          newQty,
        );
      }
    } catch (err) {
      console.error(
        '[inventory/orderConsumer] Error processing item productId=%s orderId=%s',
        item.productId,
        orderId,
        err,
      );
    }
  }
}

export async function startOrderConsumer(): Promise<void> {
  await createConsumer(GROUP_ID, ['order.created'], async (topic, payload) => {
    try {
      if (topic === 'order.created') {
        await handleOrderCreated(payload);
      }
    } catch (err) {
      console.error('[inventory/orderConsumer] Unhandled error processing topic=%s', topic, err);
    }
  });
  console.log('[inventory/orderConsumer] Subscribed to order.created');
}
