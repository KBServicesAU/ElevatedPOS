import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get('org_portal_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = decodeJwt(token);

  return NextResponse.json({
    firstName: (payload['firstName'] ?? payload['given_name'] ?? '') as string,
    lastName: (payload['lastName'] ?? payload['family_name'] ?? '') as string,
    email: (payload['email'] ?? payload['sub'] ?? '') as string,
    role: (payload['role'] ?? payload['roles'] ?? '') as string,
  });
}
