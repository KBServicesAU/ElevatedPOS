/**
 * GET /api/auth/device-sso?token=<accessToken>&redirect=<path>
 *
 * Called by the native Dashboard app WebView to exchange a valid
 * employee access token for a web session cookie — eliminating the
 * double-login screen.
 *
 * Flow:
 *   1. Native app calls /api/v1/auth/login → stores refresh token
 *   2. On "Open Web Dashboard": exchanges refresh → fresh access token
 *   3. Loads WebView at this endpoint with ?token=<accessToken>
 *   4. We validate the token against the auth service, set the
 *      elevatedpos_token httpOnly cookie, and redirect to /dashboard
 */
import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';

  // Guard against open-redirect: only allow same-origin relative paths
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard';

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Validate the token by hitting the auth service
    const upstream = await fetch(`${AUTH_API_URL}/api/v1/employees/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      // Token invalid or expired — send to web login
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Token is valid — set the session cookie and redirect to dashboard
    const response = NextResponse.redirect(new URL(safeRedirect, request.url));
    response.cookies.set('elevatedpos_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
