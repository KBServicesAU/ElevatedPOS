import type { BaseEvent } from './base';

export interface ProductCreatedEvent extends BaseEvent {
  type: 'product.created';
  productId: string;
  name: string;
  sku: string;
  categoryId?: string;
  basePrice: number;
}

export interface ProductUpdatedEvent extends BaseEvent {
  type: 'product.updated';
  productId: string;
  changedFields: string[];
}

export interface ProductPriceChangedEvent extends BaseEvent {
  type: 'product.price_changed';
  productId: string;
  name: string;
  previousPrice: number;
  newPrice: number;
  changedByEmployeeId: string;
}

export interface ProductAvailabilityChangedEvent extends BaseEvent {
  type: 'product.availability_changed';
  productId: string;
  name: string;
  isActive: boolean;
  channels: string[];
  reason?: string;
  changedByEmployeeId: string;
}

export type CatalogEvent =
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductPriceChangedEvent
  | ProductAvailabilityChangedEvent;
