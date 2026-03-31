import { type NextRequest, NextResponse } from 'next/server';

/** Public routes that don't require authentication */
const PUBLIC_PATHS = new Set(['/login', '/forgot-password', '/reset-password']);

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
    pathname.startsWith('/api/kds') ||   // KDS SSE stream (no session available on kitchen display)
    pathname.startsWith('/api/stripe/') || // Stripe Terminal routes called from POS
    pathname.startsWith('/api/orders') || // Orders store
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
    if (token && pathname === '/login') {
      const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    // Redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
