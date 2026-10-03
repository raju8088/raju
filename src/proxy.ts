import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/auth/token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and internal next requests pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const isValidSession = sessionCookie?.value ? Boolean(verifySessionToken(sessionCookie.value)) : false;

  // Protect /dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!isValidSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect authenticated users away from /login and /register
  if (pathname === '/login' || pathname === '/register') {
    if (isValidSession) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Protect sensitive API routes
  if (
    (pathname.startsWith('/api/organizations') ||
      pathname.startsWith('/api/users') ||
      pathname.startsWith('/api/auth/switch-org')) &&
    !isValidSession
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication session required to access this resource',
        },
      },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
