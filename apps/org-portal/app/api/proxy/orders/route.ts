import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL ?? process.env.ORDERS_API_URL ?? 'http://orders:4004';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get('org_portal_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const targetUrl = `${ORDERS_SERVICE_URL}/api/v1/orders${url.search}`;

  let data: unknown;
  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    try {
      data = await upstream.json();
    } catch {
      data = {};
    }
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error('[orders-proxy] upstream error:', err);
    return NextResponse.json({ error: 'Orders service unavailable' }, { status: 503 });
  }
}
