import type { BaseEvent } from './base';

export interface ShiftOpenedEvent extends BaseEvent {
  type: 'shift.opened';
  shiftId: string;
  registerId: string;
  locationId: string;
  employeeId: string;
  openingFloat: number;
  openedAt: string;
}

export interface ShiftClosedEvent extends BaseEvent {
  type: 'shift.closed';
  shiftId: string;
  registerId: string;
  locationId: string;
  employeeId: string;
  expectedCash: number;
  countedCash: number;
  variance: number;
  totalSales: number;
  transactionCount: number;
  closedAt: string;
}

export interface BookingNoShowEvent extends BaseEvent {
  type: 'booking.no_show';
  bookingId: string;
  locationId: string;
  customerId?: string;
  partySize: number;
  scheduledAt: string;
  markedByEmployeeId: string;
}

export type StaffEvent = ShiftOpenedEvent | ShiftClosedEvent | BookingNoShowEvent;
