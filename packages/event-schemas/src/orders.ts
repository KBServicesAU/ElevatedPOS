import type { BaseEvent } from './base';

export interface OrderLine {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  lineTotal: number;
  modifiers: Array<{ groupId: string; optionId: string; name: string; priceAdjustment: number }>;
  seatNumber?: number;
  course?: string;
  notes?: string;
  status: 'pending' | 'sent_to_kitchen' | 'ready' | 'served' | 'void' | 'comp';
}

export interface OrderCreatedEvent extends BaseEvent {
  type: 'order.created';
  orderId: string;
  orderNumber: string;
  locationId: string;
  registerId: string;
  channel: 'pos' | 'online' | 'kiosk' | 'qr' | 'marketplace' | 'delivery' | 'phone';
  orderType: 'retail' | 'dine_in' | 'takeaway' | 'delivery' | 'pickup' | 'layby' | 'quote';
  customerId?: string;
  employeeId: string;
  tableId?: string;
  covers?: number;
  lines: OrderLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  notes?: string;
}

export interface OrderCompletedEvent extends BaseEvent {
  type: 'order.completed';
  orderId: string;
  orderNumber: string;
  locationId: string;
  customerId?: string;
  total: number;
  paidTotal: number;
  completedAt: string;
}

export interface OrderCancelledEvent extends BaseEvent {
  type: 'order.cancelled';
  orderId: string;
  locationId: string;
  reason: string;
  cancelledAt: string;
}

export interface OrderRefundedEvent extends BaseEvent {
  type: 'order.refunded';
  orderId: string;
  refundId: string;
  locationId: string;
  customerId?: string;
  amount: number;
  reason: string;
  refundMethod: 'original' | 'store_credit' | 'cash' | 'exchange';
  processedAt: string;
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderCompletedEvent
  | OrderCancelledEvent
  | OrderRefundedEvent;
