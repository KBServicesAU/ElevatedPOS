import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

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
  campaigns: {
    base: process.env.CAMPAIGNS_API_URL ?? 'http://localhost:4008',
    prefix: '/api/v1/campaigns',
  },
  automations: {
    base: process.env.AUTOMATIONS_API_URL ?? 'http://localhost:4011',
    prefix: '/api/v1/automations',
  },
  'integration-apps': {
    base: process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010',
    prefix: '/api/v1/integrations/apps',
  },
  payments: {
    base: process.env.PAYMENTS_API_URL ?? 'http://localhost:4005',
    prefix: '/api/v1/payments',
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
  const token = cookieStore.get('nexus_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
