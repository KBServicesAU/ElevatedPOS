import type { BaseEvent } from './base';

export interface CustomerCreatedEvent extends BaseEvent {
  type: 'customer.created';
  customerId: string;
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  source: 'pos' | 'online' | 'import' | 'manual';
}

export interface CustomerUpdatedEvent extends BaseEvent {
  type: 'customer.updated';
  customerId: string;
  changedFields: Record<string, { before: unknown; after: unknown }>;
}

export type CustomerEvent = CustomerCreatedEvent | CustomerUpdatedEvent;
