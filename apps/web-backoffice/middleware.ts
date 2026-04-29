import { type NextRequest, NextResponse } from 'next/server';

/** Public routes that don't require authentication */
const PUBLIC_PATHS = new Set(['/login', '/forgot-password', '/reset-password', '/verify-email']);

/**
 * Decode JWT exp claim without signature verification.
 * Returns true if the token is expired or unreadable.
 * Uses atob (available on Edge runtime) not Buffer.
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const exp = payload['exp'];
    if (typeof exp !== 'number') return false; // no expiry = treat as valid
    return exp * 1000 < Date.now();
  } catch {
    return true; // malformed token = treat as expired
  }
}

/**
 * Fullscreen app routes — POS terminal, KDS, Kiosk.
 * These run on dedicated hardware without a staff login session.
 */
function isFullscreenApp(pathname: string): boolean {
  return (
    pathname.startsWith('/pos') ||
    pathname.startsWith('/kds') ||
    pathname.startsWith('/kiosk')
  );
}

/** Routes that are always allowed regardless of auth (Next.js internals, API, static) */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') || // login / logout endpoints
    pathname === '/api/health' ||         // Kubernetes liveness/readiness probes
    pathname.startsWith('/api/kds') ||   // KDS SSE stream — device token validated inside the route handler
    pathname.startsWith('/api/stripe/') || // Stripe Terminal routes called from POS
    pathname.startsWith('/timapi/') ||   // ANZ TIM API SDK static files (timapi.js, timapi.wasm)
    pathname === '/favicon.ico' ||
    pathname === '/'
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public assets and auth API routes
  if (isPublicAsset(pathname)) return NextResponse.next();

  // Fullscreen terminal apps don't require a staff session
  if (isFullscreenApp(pathname)) return NextResponse.next();

  // Check for auth cookie
  const token = request.cookies.get('elevatedpos_token')?.value;

  // Redirect already-authenticated users away from login page
  if (PUBLIC_PATHS.has(pathname)) {
    if (token && pathname === '/login' && !isTokenExpired(token)) {
      // v2.7.68 — clamp `next` to internal paths. `new URL(next, request.url)`
      // happily accepts an absolute URL like `https://attacker.com` and
      // overrides the base, turning this redirect into an open-redirect.
      // Reject anything that isn't a single-leading-slash path (rules out
      // protocol-relative `//attacker` and Windows-style `/\` tricks).
      const nextRaw = request.nextUrl.searchParams.get('next');
      const next =
        nextRaw &&
        nextRaw.startsWith('/') &&
        !nextRaw.startsWith('//') &&
        !nextRaw.startsWith('/\\')
          ? nextRaw
          : '/dashboard';
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.next();
  }

  if (!token || isTokenExpired(token)) {
    // Redirect to login with return URL; delete stale cookie to prevent redirect loops
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.delete('elevatedpos_token');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals, favicon, and TIM API SDK files.
  // Excluding /timapi/ is essential — the middleware must not intercept requests
  // for timapi.js / timapi.wasm or Next.js won't serve them as static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|timapi).*)',
  ],
};
