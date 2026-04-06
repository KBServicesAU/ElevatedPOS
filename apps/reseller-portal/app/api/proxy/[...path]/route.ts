import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('reseller_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = params.path.join('/');
  const url = new URL(request.url);
  const targetUrl = `${AUTH_API_URL}/${path}${url.search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const text = await request.text();
    if (text) {
      init.body = text;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch {
    return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 502 });
  }

  // If upstream returned 401, clear the stale cookie and signal re-auth
  if (upstream.status === 401) {
    const response = NextResponse.json({ error: 'Session expired' }, { status: 401 });
    response.cookies.set('reseller_token', '', { maxAge: 0, path: '/' });
    return response;
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    data = {};
  }

  return NextResponse.json(data, { status: upstream.status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}
