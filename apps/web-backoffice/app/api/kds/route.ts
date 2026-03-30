import { NextRequest } from 'next/server';
import { ordersStore, kdsOrderToStored } from '@/lib/store';

// ─── SSE subscriber registry ──────────────────────────────────────────────────
// Module-level — persists for the lifetime of the Node.js process.

const encoder = new TextEncoder();
const subscribers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

// Pending KDS tickets (not-yet-bumped orders shown on kitchen screens)
interface KdsOrderPayload {
  orderId: string;
  orderNumber: string;
  orderType: string;
  channel: string;
  tableId?: string;
  locationId: string;
  lines: { name: string; qty: number; price?: number; modifiers?: string[]; seatNumber?: number; course?: string }[];
  createdAt: string;
  status: string;
}
const pendingOrders = new Map<string, KdsOrderPayload>();

function send(ctrl: ReadableStreamDefaultController<Uint8Array>, payload: object) {
  try {
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  } catch {
    // controller already closed — will be cleaned up on next broadcast
  }
}

function broadcast(payload: object) {
  for (const [id, ctrl] of subscribers) {
    try {
      send(ctrl, payload);
    } catch {
      subscribers.delete(id);
    }
  }
}

// ─── GET — open SSE stream ─────────────────────────────────────────────────────

export async function GET() {
  const id = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscribers.set(id, controller);
      // Acknowledge connection
      send(controller, { type: 'connected' });
      // Replay all pending (un-bumped) tickets so reconnecting screens catch up
      for (const order of pendingOrders.values()) {
        send(controller, { type: 'new_order', order });
      }
    },
    cancel() {
      subscribers.delete(id);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── POST — publish event to all KDS screens ──────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    type: string;
    order?: KdsOrderPayload;
    orderId?: string;
    paymentMethod?: string;
    paymentRef?: string;
    cardLast4?: string;
    cardBrand?: string;
  };

  if (body.type === 'new_order' && body.order) {
    pendingOrders.set(body.order.orderId, body.order);

    // Persist to orders store for dashboard
    ordersStore.add(
      kdsOrderToStored(body.order, {
        paymentMethod: body.paymentMethod,
        paymentRef: body.paymentRef,
        cardLast4: body.cardLast4,
        cardBrand: body.cardBrand,
      }),
    );
  } else if (body.type === 'order_bumped' && body.orderId) {
    pendingOrders.delete(body.orderId);
    ordersStore.updateStatus(body.orderId, 'completed');
  }

  broadcast(body);
  return Response.json({ ok: true, listeners: subscribers.size, pending: pendingOrders.size });
}
