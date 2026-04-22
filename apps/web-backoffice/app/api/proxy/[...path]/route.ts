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
  // "catalog" is a catch-all for all catalog-service endpoints using the
  // /api/proxy/catalog/<resource> convention used in POS, kiosk, product-form, etc.
  catalog: {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1',
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
  'stock/movements': {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/stock/movements',
  },
  'purchase-orders': {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/purchase-orders',
  },
  employees: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/employees',
  },
  roles: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/roles',
  },
  // v2.7.38 — display signage CMS routes. Without these, the
  // /dashboard/display page 404s on every call because its apiFetch
  // goes through /api/proxy/<service>/<rest> and <service>='display'
  // wasn't in the map. The routes live on the auth service which
  // already owns the `devices` table.
  display: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/display',
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
  // "integrations" is used with full paths like /api/proxy/integrations/api/v1/connect/...
  // so the prefix must be empty — the frontend provides the complete path segment.
  integrations: {
    base: process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010',
    prefix: '',
  },
  // "connect" shorthand — routes to the integrations service's /api/v1/connect/* surface.
  // Keeps component code concise: apiFetch('connect/account-status') works without the full path.
  connect: {
    base: process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010',
    prefix: '/api/v1/connect',
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
  'promo-codes': {
    base: process.env.CATALOG_API_URL ?? 'http://localhost:4002',
    prefix: '/api/v1/promo-codes',
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
  printers: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/printers',
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
  // Alerts — routed to notifications service
  alerts: {
    base: process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:4009',
    prefix: '/api/v1/alerts',
  },
  // v2.7.41 — alert rules live in the automations service (Postgres-backed).
  // Replaces the v2.7.40 in-memory Next.js shadow under /api/proxy/alerts/rules
  // that lost its data on every server restart. Dashboard Alex Center calls
  // `alerts-rules` via apiFetch and this routes to the real service.
  'alerts-rules': {
    base: process.env.AUTOMATIONS_API_URL ?? 'http://localhost:4011',
    prefix: '/api/v1/automations/alerts/rules',
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
  // "loyalty" catch-all — covers loyalty/programs/*, loyalty/stamps/*, loyalty/accounts/*, etc.
  loyalty: {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/loyalty',
  },
  // "membership" catch-all — covers membership/plans/*, membership/subscriptions/*
  membership: {
    base: process.env.LOYALTY_API_URL ?? 'http://localhost:4007',
    prefix: '/api/v1/memberships',
  },
  // Automation rules — alias for automations service
  'automation-rules': {
    base: process.env.AUTOMATIONS_API_URL ?? 'http://localhost:4011',
    prefix: '/api/v1/automation-rules',
  },
  // "inventory" alias for stock service
  inventory: {
    base: process.env.INVENTORY_API_URL ?? 'http://localhost:4003',
    prefix: '/api/v1/inventory',
  },
  // Reservations + settings — integrations service (restaurant & service bookings)
  reservations: {
    base: process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010',
    prefix: '/api/v1/reservations',
  },
  // Waitlist — routed to orders service
  waitlist: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/waitlist',
  },
  // EFTPOS payment intents — ANZ TIM API crash recovery and audit
  eftpos: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/eftpos',
  },
  // Billing — subscription management in payments service (payment methods, invoices)
  billing: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/billing',
  },
  // Billing SaaS — Stripe subscription lifecycle routes in auth service
  // Handles: status, portal (Stripe Customer Portal), setup, webhook
  'billing-saas': {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/billing',
  },
  // Migrations — used by Easy Move to track import job status
  migrations: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/migrations',
  },
  // Tables — floor plan management
  tables: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/tables',
  },
  // Table sections
  sections: {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/sections',
  },
  // Roster / scheduling — time-clock service
  roster: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/roster',
  },
  // Organisation onboarding — auth service
  organisations: {
    base: process.env.AUTH_API_URL ?? 'http://localhost:4001',
    prefix: '/api/v1/organisations',
  },
  // Till sessions — cash management, Z-reports, float tracking (orders service)
  'till-sessions': {
    base: process.env.ORDERS_API_URL ?? 'http://localhost:4004',
    prefix: '/api/v1/till-sessions',
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

    // Null-body statuses (204/205/304) — the Web Fetch spec forbids passing a
    // body with these codes. `new Response(text, { status: 204 })` throws
    // "Invalid response status code 204" which bubbles up as a 503 Service
    // Unavailable and breaks DELETE flows upstream (e.g. terminal credentials).
    if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
      return new NextResponse(null, { status: upstream.status });
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
