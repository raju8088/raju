import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/auth/token';

// ─── Route Categories ─────────────────────────────────────────────────────────
// Public webhook routes must NOT require authentication — providers call these.
const PUBLIC_WEBHOOK_PATHS = [
  '/api/webhooks/omnidimension',
  '/api/webhooks/meta',
  '/api/webhooks/razorpay',
];

// Public API routes accessible without authentication.
const PUBLIC_API_PATHS = ['/api/health', '/api/billing/plans'];

// Dashboard and private API routes that always require a session.
const PROTECTED_DASHBOARD = '/dashboard';
const PROTECTED_API_PREFIXES = [
  '/api/agents',
  '/api/calls',
  '/api/campaigns',
  '/api/contacts',
  '/api/leads',
  '/api/organizations',
  '/api/users',
  '/api/billing',
  '/api/admin',
  '/api/integrations',
  '/api/knowledge-base',
  '/api/phone-numbers',
  '/api/catalog',
  '/api/auth/switch-org',
  '/api/auth/logout',
  '/api/auth/session',
];

// ─── Open Redirect Guard ──────────────────────────────────────────────────────
/**
 * Validate a "redirect" query param to ensure it is a local path only.
 * Prevents open-redirect attacks via crafted ?redirect=https://evil.com
 */
function sanitizeRedirectPath(raw: string | null): string {
  if (!raw) return '/dashboard';
  // Must start with / and not be a protocol-relative URL
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw;
  }
  return '/dashboard';
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Static assets pass through immediately
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Webhook routes are always public — provider-to-server calls
  if (PUBLIC_WEBHOOK_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 3. Explicitly public routes pass through
  if (PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // 4. Resolve session
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const isValidSession = sessionCookie?.value
    ? Boolean(verifySessionToken(sessionCookie.value))
    : false;

  // 5. Protected dashboard routes — redirect to login
  if (pathname.startsWith(PROTECTED_DASHBOARD)) {
    if (!isValidSession) {
      const loginUrl = new URL('/login', request.url);
      // Use safe redirect path
      loginUrl.searchParams.set('redirect', sanitizeRedirectPath(pathname));
      return NextResponse.redirect(loginUrl);
    }
  }

  // 6. Redirect already-authenticated users away from auth pages
  if (pathname === '/login' || pathname === '/register') {
    if (isValidSession) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // 7. Protected API routes — return 401 if unauthenticated
  if (PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isValidSession) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication session required',
          },
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
