import type { BaseEvent } from './base';

export interface InventoryLowStockEvent extends BaseEvent {
  type: 'inventory.low_stock';
  locationId: string;
  productId: string;
  variantId?: string;
  productName: string;
  onHand: number;
  reorderPoint: number;
}

export interface InventoryStockAdjustedEvent extends BaseEvent {
  type: 'inventory.stock_adjusted';
  locationId: string;
  productId: string;
  variantId?: string;
  beforeQty: number;
  afterQty: number;
  adjustment: number;
  reason: string;
  employeeId: string;
  referenceId?: string;
  referenceType?: 'purchase_order' | 'transfer' | 'stocktake' | 'manual' | 'sale' | 'refund';
}

export interface InventoryStockZeroEvent extends BaseEvent {
  type: 'inventory.stock_zero';
  locationId: string;
  productId: string;
  variantId?: string;
  productName: string;
  isSoldOnline: boolean;
}

export interface PurchaseOrderCreatedEvent extends BaseEvent {
  type: 'purchase_order.created';
  purchaseOrderId: string;
  poNumber: string;
  locationId: string;
  supplierId: string;
  total: number;
  createdByEmployeeId: string;
}

export interface PurchaseOrderReceivedEvent extends BaseEvent {
  type: 'purchase_order.received';
  purchaseOrderId: string;
  poNumber: string;
  locationId: string;
  isComplete: boolean;
  receivedByEmployeeId: string;
}

export type InventoryEvent =
  | InventoryLowStockEvent
  | InventoryStockAdjustedEvent
  | InventoryStockZeroEvent
  | PurchaseOrderCreatedEvent
  | PurchaseOrderReceivedEvent;
