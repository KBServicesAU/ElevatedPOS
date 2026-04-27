import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL || 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, businessName, email, password, phone, abn } = body;

    if (!firstName || !lastName || !businessName || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const res = await fetch(`${AUTH_API_URL}/api/v1/organisations/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName,
        // v2.7.51 — also normalise here as a safety net; the auth service
        // also lowercases on its end so login can find the row.
        email: typeof email === 'string' ? email.trim().toLowerCase() : email,
        password,
        firstName,
        lastName,
        phone: phone || undefined,
        abn: abn || undefined,
        // The legacy `plan` enum is still required by the schema for
        // back-compat. Per-device pricing happens in the next step
        // (/api/onboard/device-pricing) via billingModel = 'per_device'.
        plan: 'starter',
      }),
    });

    const data = await res.json();

    if (res.status === 409) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || 'Registration failed' },
        { status: res.status }
      );
    }

    return NextResponse.json({
      orgId: data.orgId || data.organisationId || data.id,
      token: data.token || data.accessToken || undefined,
    });
  } catch (err) {
    console.error('[onboard/register] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
