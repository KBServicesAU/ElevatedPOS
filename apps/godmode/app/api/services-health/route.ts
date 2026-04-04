import { NextResponse } from 'next/server';

const SERVICES: Record<string, string> = {
  auth: process.env['AUTH_API_URL'] ?? 'http://auth:4001',
  catalog: process.env['CATALOG_API_URL'] ?? 'http://catalog:4002',
  inventory: process.env['INVENTORY_API_URL'] ?? 'http://inventory:4003',
  orders: process.env['ORDERS_API_URL'] ?? 'http://orders:4004',
  payments: process.env['PAYMENTS_API_URL'] ?? 'http://payments:4005',
  customers: process.env['CUSTOMERS_API_URL'] ?? 'http://customers:4006',
  loyalty: process.env['LOYALTY_API_URL'] ?? 'http://loyalty:4007',
  campaigns: process.env['CAMPAIGNS_API_URL'] ?? 'http://campaigns:4008',
  notifications: process.env['NOTIFICATIONS_API_URL'] ?? 'http://notifications:4009',
  integrations: process.env['INTEGRATIONS_API_URL'] ?? 'http://integrations:4010',
  automations: process.env['AUTOMATIONS_API_URL'] ?? 'http://automations:4011',
  ai: process.env['AI_API_URL'] ?? 'http://ai:4012',
  franchise: process.env['FRANCHISE_API_URL'] ?? 'http://franchise:4013',
  reporting: process.env['REPORTING_API_URL'] ?? 'http://reporting:4014',
  webhooks: process.env['WEBHOOKS_API_URL'] ?? 'http://webhooks:4015',
};

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  checkedAt: string;
  error?: string;
}

async function checkService(name: string, baseUrl: string): Promise<ServiceHealth> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    if (res.ok) {
      const status = responseTime > 1000 ? 'degraded' : 'healthy';
      return { service: name, status, responseTime, checkedAt };
    } else {
      return { service: name, status: 'degraded', responseTime, checkedAt, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    const responseTime = Date.now() - start;
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { service: name, status: 'down', responseTime, checkedAt, error };
  }
}

export async function GET() {
  const results = await Promise.all(
    Object.entries(SERVICES).map(([name, url]) => checkService(name, url))
  );
  return NextResponse.json({ data: results });
}
