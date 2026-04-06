import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

interface RegisterBody {
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  abn?: string;
  plan?: string;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('reseller_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as RegisterBody;

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/organisations/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json() as Record<string, unknown>;
    } catch {
      // non-JSON upstream
    }

    if (!upstream.ok) {
      const errorMsg =
        (data['message'] as string) ||
        (data['error'] as string) ||
        `Registration error ${upstream.status}`;
      return NextResponse.json({ error: errorMsg }, { status: upstream.status });
    }

    const orgId = (data['orgId'] ?? data['id'] ?? data['organisationId']) as string;
    return NextResponse.json(
      {
        orgId,
        email: body.email,
        businessName: body.businessName,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[reseller-portal/onboard/register] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
