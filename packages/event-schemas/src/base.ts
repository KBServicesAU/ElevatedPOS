export interface BaseEvent {
  id: string;
  orgId: string;
  occurredAt: string; // ISO 8601
  version: number;
}
