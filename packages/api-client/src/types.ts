// ---------------------------------------------------------------------------
// Pagination / wrapper types
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    totalCount: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface ApiResponse<T> {
  data: T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserSession {
  employeeId: string;
  orgId: string;
  locationIds: string[];
  roleId: string;
  permissions: string[];
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  orgId: string;
  name: string;
  parentId?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  orgId: string;
  name: string;
  sku: string;
  basePrice: number;
  costPrice?: number;
  isActive: boolean;
  categoryId?: string;
  tags: string[];
  description?: string;
  imageUrl?: string;
  barcode?: string;
  unitOfMeasure?: string;
  taxRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductBundle {
  id: string;
  orgId: string;
  name: string;
  sku: string;
  price: number;
  items: Array<{ productId: string; quantity: number }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export interface OrderLine {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  notes?: string;
}

export interface Order {
  id: string;
  orgId: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  customerId?: string;
  locationId?: string;
  employeeId?: string;
  lines: OrderLine[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface StockLevel {
  id: string;
  productId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint?: number;
  reorderQty?: number;
  updatedAt: string;
}

export interface StockAdjustment {
  id: string;
  productId: string;
  locationId: string;
  quantityChange: number;
  reason: string;
  employeeId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

export interface LoyaltyAccount {
  id: string;
  orgId: string;
  customerId: string;
  programId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier?: string;
  enrolledAt: string;
  updatedAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  accountId: string;
  orderId?: string;
  type: 'earn' | 'redeem' | 'expire' | 'adjust';
  points: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded' | 'partial_refund';

export interface Payment {
  id: string;
  orgId: string;
  orderId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEvent =
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

export interface Webhook {
  id: string;
  orgId: string;
  label: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  /** Only present on initial creation response — masked afterwards */
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  durationMs?: number;
  error?: string;
  nextRetryAt?: string;
  attemptedAt: string;
}
