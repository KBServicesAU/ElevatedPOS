import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ordersStore } from '@/lib/store';

/** Serve orders from the in-memory store when the orders microservice is offline */
async function ordersStoreFallback(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const result = ordersStore.toDashboardList({
    status: searchParams.get('status') ?? undefined,
    channel: searchParams.get('channel') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    limit: Number(searchParams.get('limit') ?? 50),
  });
  return NextResponse.json(result);
}

/**
 * Catch-all API proxy — forwards requests to the appropriate microservice.
 * The client calls /api/proxy/<service>/<rest...>?query=params
 * This proxy adds the Bearer token from the session cookie and forwards
 * to the real service using server-side env vars (never exposed to browser).
 */

const SERVICE_MAP: Record<string, { base: string; prefix: string }> = {
  orders: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/orders',
  },
  products: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/products',
  },
  categories: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/categories',
  },
  stock: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/stock',
  },
  'purchase-orders': {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/purchase-orders',
  },
  employees: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/employees',
  },
  customers: {
    base: process.env.CUSTOMERS_API_URL ?? 'http://localhost:4006',
    prefix: '/api/v1/customers',
  },
  programs: {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/loyalty/programs',
  },
  'loyalty-accounts': {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/loyalty/accounts',
  },
  'loyalty-transactions': {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/loyalty/transactions',
  },
  'loyalty-stamps': {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/loyalty/stamps',
  },
  'membership-plans': {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/memberships/plans',
  },
  'membership-subscriptions': {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/memberships/subscriptions',
  },
  campaigns: {
    base: process.env.CAMPAIGNS_API_URL ?? 'http://localhost:4008',
    prefix: '/api/v1/campaigns',
  },
  segments: {
    base: process.env.CAMPAIGNS_API_URL ?? 'http://localhost:4008',
    prefix: '/api/v1/segments',
  },
  'campaign-templates': {
    base: process.env.CAMPAIGNS_API_URL ?? 'http://localhost:4008',
    prefix: '/api/v1/templates',
  },
  automations: {
    base: process.env.AUTOMATIONS_API_URL ?? 'http://localhost:4011',
    prefix: '/api/v1/automations',
  },
  'integration-apps': {
    base: process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010',
    prefix: '/api/v1/integrations/apps',
  },
  webhooks: {
    base: process.env.WEBHOOKS_API_URL ?? 'http://localhost:4015',
    prefix: '/api/v1/webhooks',
  },
  payments: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/payments',
  },
  'payment-links': {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/payment-links',
  },
  bnpl: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/bnpl',
  },
  currencies: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/currencies',
  },
  ai: {
    base: process.env.AI_API_URL ?? 'http://localhost:4012',
    prefix: '/api/v1/ai',
  },
  'ai-chat': {
    base: process.env.AI_API_URL ?? 'http://localhost:4012',
    prefix: '/api/v1/ai',
  },
  franchise: {
    base: process.env.FRANCHISE_API_URL ?? 'http://localhost:4013',
    prefix: '/api/v1/franchise',
  },
  rfm: {
    base: process.env.CUSTOMERS_API_URL ?? 'http://localhost:4006',
    prefix: '/api/v1/customers',
  },
  laybys: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/laybys',
  },
  'gift-cards': {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/gift-cards',
  },
  quotes: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/quotes',
  },
  bundles: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/bundles',
  },
  'price-lists': {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/price-lists',
  },
  markdowns: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/markdowns',
  },
  recipes: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/recipes',
  },
  serials: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/serials',
  },
  lots: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/lots',
  },
  reports: {
    base: process.env.REPORTING_API_URL ?? 'http://localhost:4014',
    prefix: '/api/v1/reports',
  },
  search: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/search',
  },
  graphql: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/graphql',
  },
  fulfillment: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/fulfillment',
  },
  locations: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/locations',
  },
  // Device management — paired terminals, pairing codes
  devices: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/devices',
  },
  // Settings — business-level configuration stored in the auth / organisation service
  settings: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/settings',
  },
  // Tax rates managed by the catalog service
  'tax-rates': {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/tax-rates',
  },
  // Payment method configuration in the payments service
  'payment-methods': {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/payment-methods',
  },
  // EFTPOS terminal credentials + per-device payment config
  terminal: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/terminal',
  },
  transfers: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/transfers',
  },
  suppliers: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/suppliers',
  },
  stocktakes: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/stocktakes',
  },
  shifts: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/time-clock',
  },
  // Scheduling / roster — routed to time-clock service (same shift records)
  schedules: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/time-clock',
  },
  refunds: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/refunds',
  },
  // CRM routes (notes, timeline, merge) — customers service
  crm: {
    base: process.env.CUSTOMERS_API_URL ?? 'http://localhost:4006',
    prefix: '/api/v1/crm',
  },
  // Payroll export — auth service
  payroll: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/payroll',
  },
  // Points multiplier events — loyalty service
  'multiplier-events': {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/loyalty/multiplier-events',
  },
  // Notifications service routes
  notifications: {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/notifications',
  },
  'notification-logs': {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/notifications/logs',
  },
  'notification-devices': {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/notifications/devices',
  },
  'notification-email': {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/notifications/email',
  },
  'notification-sms': {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/notifications/sms',
  },
  'notification-push': {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/notifications/push',
  },
};

async function proxyRequest(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const [service, ...rest] = segments;

  const mapping = SERVICE_MAP[service];
  if (!mapping) {
    return NextResponse.json({ error: `Unknown service: ${service}` }, { status: 404 });
  }

  const subPath = rest.length > 0 ? `/${rest.join('/')}` : '';
  const targetUrl = `${mapping.base}${mapping.prefix}${subPath}${request.nextUrl.search}`;

  const cookieStore = cookies();
  const token = cookieStore.get('elevatedpos_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Device-authenticated terminals (POS, kiosk, KDS) don't have a session
    // cookie — they carry their own JWT as a Bearer token in the request.
    const incoming = request.headers.get('Authorization');
    if (incoming) {
      headers['Authorization'] = incoming;
    }
  }

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // Disable Next.js caching for proxy requests
      cache: 'no-store',
    });

    // For orders GET: if the real service is unavailable, fall back to in-memory store
    if (service === 'orders' && request.method === 'GET' && !upstream.ok) {
      return await ordersStoreFallback(request);
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await upstream.json();
      return NextResponse.json(json, { status: upstream.status });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    // Network error — fall back to in-memory store for orders
    if (service === 'orders' && request.method === 'GET') {
      return await ordersStoreFallback(request);
    }
    console.error('[proxy] upstream fetch failed', targetUrl, err);
    return NextResponse.json(
      { error: 'Service unavailable', detail: String(err) },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}
export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}
export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}
export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}
export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}
