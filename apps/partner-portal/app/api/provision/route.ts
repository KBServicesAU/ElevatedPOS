import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_URL = process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://auth:4001';

/**
 * POST /api/provision
 * Creates a new merchant organisation via the auth service registration endpoint.
 * The new org is created with a generated password; a welcome email is sent
 * to the owner who completes their setup via the email link.
 */
export async function POST(req: NextRequest) {
  const jar = cookies();
  const partnerToken =
    jar.get('partner_token')?.value ?? jar.get('elevatedpos_platform_token')?.value ?? '';

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { businessName, abn, email, phone, firstName, lastName, plan, industry } = body;

  if (!businessName || !email || !firstName || !lastName) {
    return NextResponse.json({ error: 'businessName, email, firstName and lastName are required' }, { status: 422 });
  }

  // Generate a random temporary password — owner will reset via email verification
  const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';

  try {
    const res = await fetch(`${AUTH_URL}/api/v1/organisations/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pass partner token so platform can attribute this org to the partner
        ...(partnerToken ? { Authorization: `Bearer ${partnerToken}` } : {}),
      },
      body: JSON.stringify({
        businessName,
        email,
        firstName,
        lastName,
        password: tempPassword,
        phone: phone ?? undefined,
        abn: abn ?? undefined,
        plan: plan ?? 'starter',
        industry: industry ?? undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { message?: string }).message ?? 'Provisioning failed' },
        { status: res.status },
      );
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
  }
}
