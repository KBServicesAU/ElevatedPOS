import { type NextRequest, NextResponse } from 'next/server';

/** Public paths that do not require a partner session */
const PUBLIC_PATHS = new Set(['/login', '/forgot-password']);

/** Allow Next.js internals and health probes regardless of auth */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/api/health' ||
    pathname === '/favicon.ico' ||
    pathname === '/'
  );
}

/** Decode JWT exp without signature verification (edge-compatible) */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const padded = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const exp = payload['exp'];
    if (typeof exp !== 'number') return false;
    return exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname)) return NextResponse.next();

  // Check for platform token cookie (set after platform login)
  const token =
    request.cookies.get('partner_token')?.value ??
    request.cookies.get('elevatedpos_platform_token')?.value;

  if (PUBLIC_PATHS.has(pathname)) {
    if (token && !isTokenExpired(token) && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!token || isTokenExpired(token)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    const res = NextResponse.redirect(loginUrl);
    if (token) res.cookies.delete('partner_token');
    return res;
  }

  // Forward token for server-side API calls
  const response = NextResponse.next();
  response.headers.set('x-partner-token', token);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
