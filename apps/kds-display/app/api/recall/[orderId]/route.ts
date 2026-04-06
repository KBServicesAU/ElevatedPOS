import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for KDS recall (un-bump) requests.
 *
 * Mirrors the bump proxy pattern: the KDS page calls this local Next.js route,
 * which adds the INTERNAL_SECRET header server-side so the secret is never
 * exposed to the browser.
 *
 * POST /api/recall/:orderId
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const { orderId } = params;

  const ordersApiUrl =
    process.env['ORDERS_SERVICE_URL'] ??
    process.env['ORDERS_API_URL'] ??
    'http://localhost:4004';

  const internalSecret = process.env['INTERNAL_SECRET'];

  if (!internalSecret && process.env['NODE_ENV'] !== 'development') {
    return NextResponse.json(
      { error: 'INTERNAL_SECRET not configured' },
      { status: 500 },
    );
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (internalSecret) {
    headers['x-internal-secret'] = internalSecret;
  }

  try {
    const upstream = await fetch(
      `${ordersApiUrl}/api/v1/kds/recall/${encodeURIComponent(orderId)}`,
      { method: 'POST', headers },
    );

    const body = await upstream.text();

    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reach orders service', detail: message },
      { status: 502 },
    );
  }
}
