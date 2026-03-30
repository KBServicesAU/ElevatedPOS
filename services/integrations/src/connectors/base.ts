export interface ConnectorConfig {
  appKey: string;
  credentials: Record<string, string>;
  orgId: string;
  locationId?: string;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  errors: string[];
  lastSyncAt: string;
}

export abstract class BaseConnector {
  constructor(protected config: ConnectorConfig) {}
  abstract testConnection(): Promise<{ ok: boolean; message: string }>;
  abstract sync(): Promise<SyncResult>;
}
