import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

/**
 * POST /api/auth/device-pin-verify
 *
 * Verifies a staff member's PIN using the device token for authentication.
 * Returns the employee object without setting any browser cookies (device
 * tokens and user session cookies must remain separate).
 *
 * Body: { pin: string; employeeId: string; locationId: string }
 * Returns: { ok: true; employee: { id, firstName, lastName, role } }
 *       or { error: string } with appropriate status code
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { pin?: string; employeeId?: string; locationId?: string };

    if (!body.pin || !body.employeeId) {
      return NextResponse.json({ error: 'pin and employeeId are required' }, { status: 400 });
    }

    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '') ?? '';

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/pin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(deviceToken ? { Authorization: `Bearer ${deviceToken}` } : {}),
      },
      body: JSON.stringify({
        pin: body.pin,
        employeeId: body.employeeId,
        locationId: body.locationId,
      }),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try { data = await upstream.json(); } catch {}

    if (!upstream.ok) {
      const errorMsg =
        (data.message as string) ||
        (data.error as string) ||
        'Incorrect PIN';
      return NextResponse.json({ error: errorMsg }, { status: upstream.status });
    }

    // Unwrap { data: {...} } envelope if present
    const payload = (data.data && typeof data.data === 'object') ? data.data as Record<string, unknown> : data;

    return NextResponse.json({
      ok: true,
      employee: {
        id: payload.id ?? payload.employeeId ?? body.employeeId,
        firstName: payload.firstName ?? '',
        lastName: payload.lastName ?? '',
        role: payload.role ?? payload.roleName ?? 'Staff',
      },
    });
  } catch (err) {
    console.error('[device-pin-verify] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
