import type { BaseEvent } from './base';

export interface LoyaltyPointsEarnedEvent extends BaseEvent {
  type: 'loyalty.points_earned';
  loyaltyAccountId: string;
  customerId: string;
  orderId: string;
  pointsEarned: number;
  newBalance: number;
  rule: string;
}

export interface LoyaltyPointsRedeemedEvent extends BaseEvent {
  type: 'loyalty.points_redeemed';
  loyaltyAccountId: string;
  customerId: string;
  orderId: string;
  pointsRedeemed: number;
  dollarValue: number;
  newBalance: number;
}

export interface LoyaltyTierChangedEvent extends BaseEvent {
  type: 'loyalty.tier_changed';
  loyaltyAccountId: string;
  customerId: string;
  previousTierId?: string;
  newTierId: string;
  previousTierName?: string;
  newTierName: string;
}

export type LoyaltyEvent =
  | LoyaltyPointsEarnedEvent
  | LoyaltyPointsRedeemedEvent
  | LoyaltyTierChangedEvent;
