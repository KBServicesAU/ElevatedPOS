import { XeroConnector } from './xero';
import { UberEatsConnector } from './uberEats';
import { ShopifyConnector } from './shopify';
import { MYOBConnector } from './myob';
import type { BaseConnector, ConnectorConfig } from './base';

const CONNECTOR_MAP: Record<string, new (config: ConnectorConfig) => BaseConnector> = {
  'xero': XeroConnector,
  'uber-eats': UberEatsConnector,
  'shopify': ShopifyConnector,
  'myob': MYOBConnector,
};

export function createConnector(appKey: string, config: ConnectorConfig): BaseConnector | null {
  const ConnectorClass = CONNECTOR_MAP[appKey];
  if (!ConnectorClass) return null;
  return new ConnectorClass(config);
}

export function getSupportedConnectors(): string[] {
  return Object.keys(CONNECTOR_MAP);
}
