export { NexusClient } from './client.js';
export { WebhookHandler } from './webhooks.js';
export { NexusApiError, NexusNetworkError, NexusWebhookSignatureError } from './errors.js';
export type {
  // Config
  NexusClientConfig,
  ListParams,
  PaginatedResponse,

  // Domain models
  Product,
  Category,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderStatus,
  OrderChannel,
  OrderType,
  Customer,
  CustomerTier,
  Payment,
  PaymentStatus,
  PaymentMethod,
  StockLevel,
  LoyaltyAccount,

  // Webhook events
  NexusEvent,
  NexusEventType,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  OrderCompletedEvent,
  OrderCancelledEvent,
  OrderRefundedEvent,
  PaymentCapturedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
  CustomerCreatedEvent,
  CustomerUpdatedEvent,
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductDeletedEvent,
  InventoryLowStockEvent,
  InventoryOutOfStockEvent,
  InventoryAdjustedEvent,
  LoyaltyPointsEarnedEvent,
  LoyaltyPointsRedeemedEvent,
  LoyaltyTierChangedEvent,
} from './types.js';
