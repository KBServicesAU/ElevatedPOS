import { type NextRequest, NextResponse } from 'next/server';

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.svg'
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get('sales_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
};
