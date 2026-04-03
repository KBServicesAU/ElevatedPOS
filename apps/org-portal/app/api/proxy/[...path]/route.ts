import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const cookieStore = cookies();
  const token = cookieStore.get('org_portal_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = params.path.join('/');
  const url = new URL(request.url);
  const targetUrl = `${AUTH_API_URL}/api/v1/${path}${url.search}`;

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

  const upstream = await fetch(targetUrl, init);

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
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params);
}
