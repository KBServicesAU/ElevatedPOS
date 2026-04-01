// Re-export domain-specific event types (use the rich per-domain interfaces for
// new event construction; the generic BaseEvent<T> below is for the publisher
// utility and the automations consumer).
export * from './orders';
export * from './inventory';
export * from './customers';
export * from './payments';
export * from './loyalty';
export * from './catalog';
export * from './staff';
export * from './publisher';

// ─── Generic envelope (event-sourcing / Kafka pattern) ────────────────────────

/**
 * Generic event envelope.  All Kafka messages published by ElevatedPOS services are
 * wrapped in this shape so consumers can route on `eventType` before
 * deserialising the `payload`.
 */
export interface BaseEvent<T = unknown> {
  /** UUID v4 — unique identifier for this event instance */
  eventId: string;
  /** Dot-namespaced event name, e.g. "order.created" */
  eventType: string;
  /** Schema version, e.g. "1.0" */
  version: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  orgId: string;
  locationId?: string;
  /** Ties together a chain of causally-related events */
  correlationId?: string;
  payload: T;
}

// ─── Typed event aliases (payload + discriminant) ─────────────────────────────

export type OrderCreatedPayload = {
  orderId: string;
  orderNumber: string;
  total: number;
  customerId?: string;
  lineCount: number;
  channel: string;
};

export type TypedOrderCreatedEvent = BaseEvent<OrderCreatedPayload> & { eventType: 'order.created' };
export type TypedOrderCompletedEvent = BaseEvent<{ orderId: string; total: number; paymentMethod?: string }> & { eventType: 'order.completed' };
export type TypedOrderCancelledEvent = BaseEvent<{ orderId: string; reason: string }> & { eventType: 'order.cancelled' };
export type TypedOrderRefundedEvent = BaseEvent<{ orderId: string; refundAmount: number; reason: string }> & { eventType: 'order.refunded' };

export type TypedStockLowEvent = BaseEvent<{ productId: string; sku: string; locationId: string; currentStock: number; reorderPoint: number }> & { eventType: 'stock.low' };
export type TypedStockAdjustedEvent = BaseEvent<{ productId: string; locationId: string; previousQty: number; newQty: number; reason: string }> & { eventType: 'stock.adjusted' };
export type TypedPurchaseOrderCreatedEvent = BaseEvent<{ poId: string; supplierId: string; totalValue: number }> & { eventType: 'purchase_order.created' };

export type TypedCustomerCreatedEvent = BaseEvent<{ customerId: string; email?: string; channel: string }> & { eventType: 'customer.created' };
export type TypedCustomerUpdatedEvent = BaseEvent<{ customerId: string; changedFields: string[] }> & { eventType: 'customer.updated' };

export type TypedLoyaltyPointsAccruedEvent = BaseEvent<{ customerId: string; points: number; orderId?: string; newBalance: number }> & { eventType: 'loyalty.points_accrued' };
export type TypedLoyaltyPointsRedeemedEvent = BaseEvent<{ customerId: string; points: number; newBalance: number }> & { eventType: 'loyalty.points_redeemed' };
export type TypedLoyaltyTierChangedEvent = BaseEvent<{ customerId: string; previousTier: string; newTier: string }> & { eventType: 'loyalty.tier_changed' };

export type TypedPaymentSucceededEvent = BaseEvent<{ paymentId: string; orderId: string; amount: number; method: string }> & { eventType: 'payment.succeeded' };
export type TypedPaymentFailedEvent = BaseEvent<{ paymentId?: string; orderId: string; reason: string }> & { eventType: 'payment.failed' };
export type TypedRefundProcessedEvent = BaseEvent<{ refundId: string; orderId: string; amount: number }> & { eventType: 'payment.refunded' };

export type TypedCampaignSentEvent = BaseEvent<{ campaignId: string; recipientCount: number; channel: string }> & { eventType: 'campaign.sent' };

/** Discriminated union of all typed ElevatedPOS events */
export type NexusEvent =
  | TypedOrderCreatedEvent
  | TypedOrderCompletedEvent
  | TypedOrderCancelledEvent
  | TypedOrderRefundedEvent
  | TypedStockLowEvent
  | TypedStockAdjustedEvent
  | TypedPurchaseOrderCreatedEvent
  | TypedCustomerCreatedEvent
  | TypedCustomerUpdatedEvent
  | TypedLoyaltyPointsAccruedEvent
  | TypedLoyaltyPointsRedeemedEvent
  | TypedLoyaltyTierChangedEvent
  | TypedPaymentSucceededEvent
  | TypedPaymentFailedEvent
  | TypedRefundProcessedEvent
  | TypedCampaignSentEvent;

// ─── Kafka topic registry ─────────────────────────────────────────────────────

export const EVENT_TOPICS = {
  ORDERS: 'nexus.orders',
  INVENTORY: 'nexus.inventory',
  CUSTOMERS: 'nexus.customers',
  LOYALTY: 'nexus.loyalty',
  PAYMENTS: 'nexus.payments',
  CAMPAIGNS: 'nexus.campaigns',
  AUTOMATIONS: 'nexus.automations',
} as const;

export type EventTopic = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];
