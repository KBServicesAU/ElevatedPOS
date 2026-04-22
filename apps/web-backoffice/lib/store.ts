/**
 * Shared in-memory data store.
 * Module-level state persists for the lifetime of the Node.js process.
 * Used as a live fallback when microservices (orders, payments) are offline.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderLine {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  modifiers?: string[];
}

export type OrderChannel = 'pos' | 'kiosk' | 'online' | 'qr';
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface StoredOrder {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  items: OrderLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod?: string;
  paymentRef?: string;
  cardLast4?: string;
  cardBrand?: string;
  locationId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Orders store ─────────────────────────────────────────────────────────────

const MAX_ORDERS = 500;
const _orders: StoredOrder[] = [];

export const ordersStore = {
  add(order: StoredOrder): void {
    if (_orders.find((o) => o.id === order.id)) return; // deduplicate
    _orders.unshift(order);
    if (_orders.length > MAX_ORDERS) _orders.pop();
  },

  all(): StoredOrder[] {
    return [..._orders];
  },

  find(id: string): StoredOrder | undefined {
    return _orders.find((o) => o.id === id);
  },

  updateStatus(id: string, status: OrderStatus): void {
    const order = _orders.find((o) => o.id === id);
    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
    }
  },

  /** Returns orders shaped to match the dashboard orders list format */
  toDashboardList(filters?: { status?: string; channel?: string; search?: string; limit?: number }) {
    let list = [..._orders];

    if (filters?.status) list = list.filter((o) => o.status === filters.status);
    if (filters?.channel) list = list.filter((o) => o.channel === filters.channel);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q)),
      );
    }

    const limit = filters?.limit ?? 50;
    return {
      data: list.slice(0, limit).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        channel: o.channel,
        total: o.total,
        subtotal: o.subtotal,
        taxAmount: o.taxAmount,
        paymentMethod: o.paymentMethod ?? 'unknown',
        locationId: o.locationId,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        lineItems: o.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
      })),
      total: list.length,
      page: 1,
      limit,
      hasMore: list.length > limit,
    };
  },
};

// ─── Helper: build StoredOrder from a KDS new_order payload ──────────────────

export function kdsOrderToStored(
  order: {
    orderId: string;
    orderNumber: string;
    channel: string;
    locationId: string;
    lines: { name: string; qty: number; price?: number; modifiers?: string[] }[];
    createdAt: string;
  },
  opts?: { paymentMethod?: string; paymentRef?: string; cardLast4?: string; cardBrand?: string },
): StoredOrder {
  const subtotal = order.lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  const taxAmount = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const now = new Date().toISOString();

  return {
    id: order.orderId,
    orderNumber: order.orderNumber,
    channel: (order.channel as OrderChannel) ?? 'pos',
    status: 'new',
    items: order.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPrice: l.price ?? 0,
      total: (l.price ?? 0) * l.qty,
      modifiers: l.modifiers ?? [],
    })),
    subtotal,
    taxAmount,
    total,
    paymentMethod: opts?.paymentMethod,
    paymentRef: opts?.paymentRef,
    cardLast4: opts?.cardLast4,
    cardBrand: opts?.cardBrand,
    locationId: order.locationId,
    createdAt: order.createdAt,
    updatedAt: now,
  };
}

// v2.7.41 — the in-memory `alertRulesStore` that lived here through v2.7.40
// has been removed. Alert rules now live in the automations service's
// `alert_rules` table and are reached through /api/proxy/alerts-rules.
