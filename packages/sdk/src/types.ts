// ─── Core domain types ────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  price: number;
  cost: number | null;
  taxRate: number;
  trackInventory: boolean;
  isActive: boolean;
  imageUrl: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export type OrderChannel = 'pos' | 'kiosk' | 'online' | 'phone' | 'qr';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderItemModifier[];
  notes: string | null;
  subtotal: number;
}

export interface OrderItemModifier {
  id: string;
  name: string;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  merchantId: string;
  locationId: string | null;
  customerId: string | null;
  status: OrderStatus;
  channel: OrderChannel;
  type: OrderType;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  tableNumber: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type CustomerTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Customer {
  id: string;
  merchantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  tier: CustomerTier;
  totalSpend: number;
  visitCount: number;
  tags: string[];
  notes: string | null;
  optInMarketing: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';

export type PaymentMethod =
  | 'card_present'
  | 'card_not_present'
  | 'cash'
  | 'eftpos'
  | 'afterpay'
  | 'alipay'
  | 'wechat_pay'
  | 'store_credit'
  | 'loyalty_points';

export interface Payment {
  id: string;
  orderId: string;
  merchantId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: string;
  refundedAmount: number;
  acquirerReference: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockLevel {
  productId: string;
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  updatedAt: string;
}

export interface LoyaltyAccount {
  id: string;
  customerId: string;
  programId: string;
  points: number;
  lifetimePoints: number;
  tier: CustomerTier;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

export interface NexusClientConfig {
  /** Your ElevatedPOS API base URL, e.g. https://api.elevatedpos.com.au */
  baseUrl: string;
  /** Your API key (starts with nxs_) */
  apiKey: string;
  /** Optional timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface ListParams {
  page?: number;
  perPage?: number;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

// ─── Webhook event types ──────────────────────────────────────────────────────

export type NexusEventType =
  | 'order.created'
  | 'order.status_changed'
  | 'order.completed'
  | 'order.cancelled'
  | 'order.refunded'
  | 'payment.captured'
  | 'payment.failed'
  | 'payment.refunded'
  | 'customer.created'
  | 'customer.updated'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'inventory.low_stock'
  | 'inventory.out_of_stock'
  | 'inventory.adjusted'
  | 'loyalty.points_earned'
  | 'loyalty.points_redeemed'
  | 'loyalty.tier_changed';

interface BaseEvent<T extends NexusEventType, D> {
  id: string;
  type: T;
  merchantId: string;
  timestamp: string;
  data: D;
}

export type OrderCreatedEvent = BaseEvent<'order.created', { order: Order }>;
export type OrderStatusChangedEvent = BaseEvent<'order.status_changed', { order: Order; previousStatus: OrderStatus }>;
export type OrderCompletedEvent = BaseEvent<'order.completed', { order: Order }>;
export type OrderCancelledEvent = BaseEvent<'order.cancelled', { order: Order; reason: string | null }>;
export type OrderRefundedEvent = BaseEvent<'order.refunded', { order: Order; payment: Payment }>;

export type PaymentCapturedEvent = BaseEvent<'payment.captured', { payment: Payment; order: Order }>;
export type PaymentFailedEvent = BaseEvent<'payment.failed', { payment: Payment; errorCode: string }>;
export type PaymentRefundedEvent = BaseEvent<'payment.refunded', { payment: Payment; refundAmount: number }>;

export type CustomerCreatedEvent = BaseEvent<'customer.created', { customer: Customer }>;
export type CustomerUpdatedEvent = BaseEvent<'customer.updated', { customer: Customer }>;

export type ProductCreatedEvent = BaseEvent<'product.created', { product: Product }>;
export type ProductUpdatedEvent = BaseEvent<'product.updated', { product: Product }>;
export type ProductDeletedEvent = BaseEvent<'product.deleted', { productId: string }>;

export type InventoryLowStockEvent = BaseEvent<'inventory.low_stock', { stockLevel: StockLevel; product: Product }>;
export type InventoryOutOfStockEvent = BaseEvent<'inventory.out_of_stock', { stockLevel: StockLevel; product: Product }>;
export type InventoryAdjustedEvent = BaseEvent<'inventory.adjusted', { stockLevel: StockLevel; delta: number; reason: string }>;

export type LoyaltyPointsEarnedEvent = BaseEvent<'loyalty.points_earned', { account: LoyaltyAccount; pointsEarned: number; order: Order }>;
export type LoyaltyPointsRedeemedEvent = BaseEvent<'loyalty.points_redeemed', { account: LoyaltyAccount; pointsRedeemed: number; order: Order }>;
export type LoyaltyTierChangedEvent = BaseEvent<'loyalty.tier_changed', { account: LoyaltyAccount; previousTier: CustomerTier; newTier: CustomerTier }>;

export type NexusEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | OrderCompletedEvent
  | OrderCancelledEvent
  | OrderRefundedEvent
  | PaymentCapturedEvent
  | PaymentFailedEvent
  | PaymentRefundedEvent
  | CustomerCreatedEvent
  | CustomerUpdatedEvent
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductDeletedEvent
  | InventoryLowStockEvent
  | InventoryOutOfStockEvent
  | InventoryAdjustedEvent
  | LoyaltyPointsEarnedEvent
  | LoyaltyPointsRedeemedEvent
  | LoyaltyTierChangedEvent;
