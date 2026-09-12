import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authMiddleware, adminMiddleware, complianceMiddleware, operatorMiddleware, superAdminMiddleware } from './src/lib/middleware/auth';
import { rateLimitMiddleware, authRateLimit, adminRateLimit, webhookRateLimit } from './src/lib/middleware/rate-limit';
import { error } from './src/lib/middleware/response';

// ============================================
// GLOBAL NEXT.JS MIDDLEWARE
// ============================================

/**
 * Next.js middleware configuration
 * This runs on every request before it reaches API routes or pages
 */

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Skip middleware for static files and certain paths
  const skipPaths = [
    '/favicon.ico',
    '/_next',
    '/api/health',
  ];
  
  if (skipPaths.some(p => path.startsWith(p))) {
    return NextResponse.next();
  }
  
  // Apply rate limiting
  if (path.startsWith('/api/auth')) {
    const rateLimitResponse = await authRateLimit(request);
    if (rateLimitResponse.status !== undefined) {
      return rateLimitResponse;
    }
  } else if (path.startsWith('/api/admin')) {
    const rateLimitResponse = await adminRateLimit(request);
    if (rateLimitResponse.status !== undefined) {
      return rateLimitResponse;
    }
  } else if (path.startsWith('/api/webhooks')) {
    const rateLimitResponse = await webhookRateLimit(request);
    if (rateLimitResponse.status !== undefined) {
      return rateLimitResponse;
    }
  } else {
    const rateLimitResponse = await rateLimitMiddleware()(request);
    if (rateLimitResponse.status !== undefined) {
      return rateLimitResponse;
    }
  }
  
  // Apply authentication
  const authResponse = await authMiddleware(request);
  if (authResponse.status !== undefined) {
    return authResponse;
  }
  
  return NextResponse.next();
}

// Configure middleware matcher
export const config = {
  matcher: [
    '/api/:path*',
  ],
};
