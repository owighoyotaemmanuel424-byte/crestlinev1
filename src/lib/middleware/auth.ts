import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '../utils/security';
import { UnauthorizedError } from '../utils/errors';

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * Authentication middleware for Next.js API routes
 * Extracts and validates JWT token from Authorization header
 */
export async function authMiddleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Skip authentication for public endpoints
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/admin/login',
    '/api/auth/refresh',
    '/api/health',
    '/api/webhooks',
  ];
  
  if (publicRoutes.some(route => path.startsWith(route))) {
    return NextResponse.next();
  }
  
  // Extract token from Authorization header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }
  
  const token = authHeader.substring(7);
  
  try {
    const payload = verifyToken(token);
    
    // Add user to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.sub);
    requestHeaders.set('x-user-role', payload.role || 'USER');
    requestHeaders.set('x-user-email', payload.email || '');
    
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}

/**
 * Extract authenticated user from request
 *
 * Prefers the headers injected by the edge middleware. When middleware is not
 * in the request chain (it is optional in some deployments), the bearer token
 * sent by the API client is verified directly so routes still authenticate.
 */
export function getAuthUser(request: Request) {
  let userId = request.headers.get('x-user-id');
  let role = request.headers.get('x-user-role');
  let email = request.headers.get('x-user-email');

  if (!userId) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = verifyToken(authHeader.substring(7));
        userId = payload.sub;
        role = payload.role;
        email = payload.email ?? null;
      } catch {
        // Invalid or expired token: fall through to the unauthorized error.
      }
    }
  }

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  
  return {
    id: userId,
    role: role as 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'COMPLIANCE' | 'OPERATOR',
    email: email || '',
  };
}

/**
 * Check if user has required role(s)
 */
export function requireRole(
  userRole: string,
  requiredRoles: string[]
): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * Middleware factory for role-based access control
 */
export function roleMiddleware(requiredRoles: string[]) {
  return async function (request: NextRequest) {
    const user = getAuthUser(request);
    
    if (!requireRole(user.role, requiredRoles)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    
    return NextResponse.next();
  };
}

/**
 * Admin-only middleware
 */
export const adminMiddleware = roleMiddleware(['ADMIN', 'SUPER_ADMIN']);

/**
 * Compliance-only middleware
 */
export const complianceMiddleware = roleMiddleware(['COMPLIANCE', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Operator middleware (can perform operational tasks)
 */
export const operatorMiddleware = roleMiddleware(['OPERATOR', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Super admin only middleware
 */
export const superAdminMiddleware = roleMiddleware(['SUPER_ADMIN']);
