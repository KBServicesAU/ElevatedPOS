import { type NextRequest } from 'next/server';
import { ordersStore, kdsOrderToStored } from '@/lib/store';

// ─── SSE subscriber registry ──────────────────────────────────────────────────

const encoder = new TextEncoder();
const subscribers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

// Pending KDS tickets (not-yet-bumped)
interface KdsOrderPayload {
  orderId: string;
  orderNumber: string;
  orderType: string;
  channel: string;
  tableId?: string;
  locationId: string;
  lines: { name: string; qty: number; price?: number; modifiers?: string[]; note?: string; seatNumber?: number; course?: string }[];
  createdAt: string;
  status: string;
}
const pendingOrders = new Map<string, KdsOrderPayload>();

// Recently bumped orders — kept for 60 min for recall
const recentlyBumped = new Map<string, { order: KdsOrderPayload; bumpedAt: number }>();

function pruneRecalled() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, entry] of recentlyBumped) {
    if (entry.bumpedAt < cutoff) recentlyBumped.delete(id);
  }
}

function send(ctrl: ReadableStreamDefaultController<Uint8Array>, payload: object) {
  try {
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  } catch {
    // controller closed — cleaned up on next broadcast
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

// ─── GET — SSE stream OR recalled orders list ─────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // ?recalled=true → return JSON of recently bumped orders
  if (url.searchParams.get('recalled') === 'true') {
    pruneRecalled();
    const list = Array.from(recentlyBumped.values()).sort((a, b) => b.bumpedAt - a.bumpedAt);
    return Response.json({ orders: list });
  }

  const id = crypto.randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscribers.set(id, controller);
      send(controller, { type: 'connected' });
      // Replay all pending tickets on reconnect
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

// ─── POST — publish event ─────────────────────────────────────────────────────

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
    ordersStore.add(
      kdsOrderToStored(body.order, {
        paymentMethod: body.paymentMethod,
        paymentRef: body.paymentRef,
        cardLast4: body.cardLast4,
        cardBrand: body.cardBrand,
      }),
    );
  } else if (body.type === 'order_bumped' && body.orderId) {
    const order = pendingOrders.get(body.orderId);
    if (order) {
      recentlyBumped.set(body.orderId, { order, bumpedAt: Date.now() });
      pendingOrders.delete(body.orderId);
    }
    ordersStore.updateStatus(body.orderId, 'completed');
  } else if (body.type === 'order_unbumped' && body.orderId) {
    // Move order back from recall to pending and re-broadcast
    const recalled = recentlyBumped.get(body.orderId);
    if (recalled) {
      pendingOrders.set(body.orderId, recalled.order);
      recentlyBumped.delete(body.orderId);
      broadcast({ type: 'new_order', order: recalled.order });
      return Response.json({ ok: true, listeners: subscribers.size, pending: pendingOrders.size });
    }
  }

  broadcast(body);
  return Response.json({ ok: true, listeners: subscribers.size, pending: pendingOrders.size });
}
