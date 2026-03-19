import type { BaseEvent } from './base';

export interface PaymentApprovedEvent extends BaseEvent {
  type: 'payment.approved';
  paymentId: string;
  orderId: string;
  locationId: string;
  method: 'card' | 'cash' | 'store_credit' | 'gift_card' | 'voucher' | 'bnpl';
  amount: number;
  tipAmount: number;
  surchargeAmount: number;
  acquirer?: string;
  cardScheme?: string;
  cardLast4?: string;
  processedAt: string;
}

export interface PaymentDeclinedEvent extends BaseEvent {
  type: 'payment.declined';
  paymentId: string;
  orderId: string;
  locationId: string;
  method: string;
  amount: number;
  declineReason?: string;
  acquirer?: string;
  attemptedAt: string;
}

export interface RefundProcessedEvent extends BaseEvent {
  type: 'payment.refund_processed';
  refundId: string;
  originalPaymentId: string;
  orderId: string;
  locationId: string;
  amount: number;
  method: string;
  approvedByEmployeeId: string;
  processedAt: string;
}

export type PaymentEvent = PaymentApprovedEvent | PaymentDeclinedEvent | RefundProcessedEvent;
