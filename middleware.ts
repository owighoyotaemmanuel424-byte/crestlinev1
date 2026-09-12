import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { Role } from '@prisma/client';

// Protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/accounts',
  '/transactions',
  '/transfer',
  '/deposit',
  '/withdraw',
  '/cards',
  '/beneficiaries',
  '/kyc',
  '/notifications',
  '/profile',
  '/security',
  '/settings',
  '/loans',
  '/investments',
  '/savings',
  '/support',
];

// Admin-only routes
const adminRoutes = [
  '/admin',
  '/admin/customers',
  '/admin/accounts',
  '/admin/transactions',
  '/admin/transfers',
  '/admin/deposits',
  '/admin/withdrawals',
  '/admin/kyc',
  '/admin/aml',
  '/admin/fraud',
  '/admin/cards',
  '/admin/loans',
  '/admin/audit',
  '/admin/roles',
  '/admin/permissions',
  '/admin/settings',
];

// Compliance-only routes
const complianceRoutes = [
  '/admin/kyc',
  '/admin/aml',
];

// API routes that require authentication
const protectedApiRoutes = [
  '/api/accounts',
  '/api/transactions',
  '/api/transfers',
  '/api/deposits',
  '/api/withdrawals',
  '/api/cards',
  '/api/beneficiaries',
  '/api/kyc',
  '/api/notifications',
  '/api/profile',
  '/api/security',
  '/api/settings',
  '/api/loans',
  '/api/investments',
  '/api/savings',
  '/api/support',
];

// Rate limiting configuration
const rateLimitConfig: Record<string, { windowMs: number; maxRequests: number }> = {
  '/api/auth/login': { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  '/api/auth/register': { windowMs: 60 * 60 * 1000, maxRequests: 3 },
  '/api/transfers': { windowMs: 60 * 1000, maxRequests: 10 },
  '/api/deposits': { windowMs: 60 * 1000, maxRequests: 10 },
  '/api/withdrawals': { windowMs: 60 * 1000, maxRequests: 10 },
  '/api/beneficiaries': { windowMs: 60 * 1000, maxRequests: 20 },
  '/api/kyc': { windowMs: 60 * 1000, maxRequests: 5 },
  '/api/security': { windowMs: 60 * 1000, maxRequests: 5 },
};

// In-memory rate limiting store (for development, use Redis in production)
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const routeKey = Object.keys(rateLimitConfig).find(key => pathname.startsWith(key));
    if (routeKey) {
      const config = rateLimitConfig[routeKey];
      const storeKey = `${ip}:${routeKey}`;
      const now = Date.now();
      const windowMs = config.windowMs;
      
      const record = rateLimitStore.get(storeKey);
      
      if (!record || now - record.windowStart > windowMs) {
        rateLimitStore.set(storeKey, { count: 1, windowStart: now });
      } else {
        if (record.count >= config.maxRequests) {
          return NextResponse.json(
            { error: 'Too many requests, please try again later.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil((windowMs - (now - record.windowStart)) / 1000)) } }
          );
        }
        rateLimitStore.set(storeKey, { count: record.count + 1, windowStart: record.windowStart });
      }
    }
  }

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));
  const isProtectedApiRoute = protectedApiRoutes.some(route => pathname.startsWith(route));

  if (isProtectedRoute || isAdminRoute || isProtectedApiRoute) {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

    if (!token) {
      // Redirect to login for page routes, return 401 for API routes
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname + search);
      return NextResponse.redirect(loginUrl);
    }

    // Check admin routes
    if (isAdminRoute) {
      const userRole = token.role as Role;
      const allowedRoles = [Role.ADMIN, Role.SUPER_ADMIN];
      
      // Compliance routes also allow COMPLIANCE role
      if (complianceRoutes.some(route => pathname.startsWith(route))) {
        allowedRoles.push(Role.COMPLIANCE);
      }

      if (!allowedRoles.includes(userRole)) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    // Add user to request headers for API routes
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.next();
      response.headers.set('x-user-id', token.sub || '');
      response.headers.set('x-user-role', token.role as string);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|$).*)'],
};
