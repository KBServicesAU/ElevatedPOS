import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for KDS bump requests.
 *
 * KDS display devices are dedicated hardware screens without user sessions or
 * JWT tokens. Instead of calling the orders service bump endpoint directly
 * from the browser (which would fail auth), the KDS page calls this local
 * Next.js route, which adds the INTERNAL_SECRET header server-side so the
 * secret is never exposed to the browser.
 *
 * POST /api/bump/:orderId
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const { orderId } = params;
  // ORDERS_SERVICE_URL is the cluster-internal URL injected via ConfigMap.
  // Fall back to ORDERS_API_URL (docker-compose) then localhost for local dev.
  const ordersApiUrl =
    process.env['ORDERS_SERVICE_URL'] ??
    process.env['ORDERS_API_URL'] ??
    'http://localhost:4004';
  const internalSecret = process.env['INTERNAL_SECRET'];

  if (!internalSecret) {
    return NextResponse.json(
      { error: 'INTERNAL_SECRET not configured' },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(
      `${ordersApiUrl}/api/v1/kds/bump/${encodeURIComponent(orderId)}`,
      {
        method: 'POST',
        headers: {
          'x-internal-secret': internalSecret,
          'content-type': 'application/json',
        },
      },
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
