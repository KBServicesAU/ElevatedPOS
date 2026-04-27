import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env['AUTH_API_URL'] ?? 'http://localhost:4001';
const INTEGRATIONS_API_URL = process.env['INTEGRATIONS_API_URL'] ?? 'http://localhost:4010';
// v2.7.48 — orders service hosts the ANZ TIM API audit log
// (terminal_transactions). Used by the Godmode Terminal Logs page to
// drill in across orgs.
const ORDERS_API_URL = process.env['ORDERS_API_URL'] ?? 'http://localhost:4004';

// Map path prefixes to service base URLs.
// The first segment of the proxy path determines which upstream service to hit.
const SERVICE_MAP: Record<string, string> = {
  platform: AUTH_API_URL,
  integrations: INTEGRATIONS_API_URL,
  godmode: ORDERS_API_URL,
};

function resolveServiceUrl(pathSegments: string[]): string {
  const prefix = pathSegments[0] ?? '';
  return SERVICE_MAP[prefix] ?? AUTH_API_URL;
}

async function proxyRequest(request: NextRequest, pathSegments: string[], method: string) {
  const cookieStore = cookies();
  const token = cookieStore.get('godmode_token')?.value;

  const pathStr = pathSegments.join('/');
  const serviceUrl = resolveServiceUrl(pathSegments);
  const upstreamUrl = `${serviceUrl}/api/v1/${pathStr}${request.nextUrl.search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(method)) {
    try {
      body = await request.text();
    } catch {
      body = undefined;
    }
  }

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });

  const responseData = await upstream.text();

  return new NextResponse(responseData, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path, 'GET');
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path, 'POST');
}

export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path, 'PATCH');
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path, 'PUT');
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path, 'DELETE');
}
