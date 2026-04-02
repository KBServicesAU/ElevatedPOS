import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

/**
 * POST /api/auth/device/pair
 *
 * Public endpoint — no session cookie required.
 * Proxies a device pairing request to the auth microservice and returns
 * the upstream response directly to the client.
 *
 * Expected body: { code: string }
 * Returns: { deviceId, deviceToken, role, locationId, registerId, orgId, label }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json();
    } catch {
      // upstream returned non-JSON
    }

    if (!upstream.ok) {
      const errorMsg =
        (data.message as string) ||
        (data.error as string) ||
        (data.detail as string) ||
        `Pairing failed (${upstream.status})`;
      console.error('[auth/device/pair] upstream error:', upstream.status, data);
      return NextResponse.json({ error: errorMsg }, { status: upstream.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[auth/device/pair] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
