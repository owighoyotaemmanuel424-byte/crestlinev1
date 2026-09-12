import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================
// RATE LIMITING MIDDLEWARE
// ============================================

// In-memory rate limit store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMITS = {
  // Default: 100 requests per minute
  default: { max: 100, windowMs: 60 * 1000 },
  // Auth endpoints: 5 requests per minute (to prevent brute force)
  auth: { max: 5, windowMs: 60 * 1000 },
  // Webhooks: 30 requests per minute
  webhooks: { max: 30, windowMs: 60 * 1000 },
  // Admin endpoints: 60 requests per minute
  admin: { max: 60, windowMs: 60 * 1000 },
} as const;

type RateLimitConfig = typeof RATE_LIMITS[keyof typeof RATE_LIMITS];

/**
 * Get client identifier for rate limiting
 */
function getClientId(request: NextRequest): string {
  // Use IP address as identifier
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  return ip;
}

/**
 * Check and update rate limit for a client
 */
function checkRateLimit(clientId: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const key = `${clientId}:${config.max}:${config.windowMs}`;
  
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    // Reset window
    rateLimitStore.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true, remaining: config.max - 1, resetIn: config.windowMs };
  }
  
  if (record.count >= config.max) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now };
  }
  
  // Increment count
  record.count++;
  rateLimitStore.set(key, record);
  
  return { allowed: true, remaining: config.max - record.count, resetIn: record.resetTime - now };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(category: keyof typeof RATE_LIMITS = 'default') {
  const config = RATE_LIMITS[category];
  
  return async function (request: NextRequest) {
    const clientId = getClientId(request);
    const result = checkRateLimit(clientId, config);
    
    if (!result.allowed) {
      return NextResponse.json(
        {
          error: 'TooManyRequests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil(result.resetIn / 1000),
        },
        { status: 429 }
      );
    }
    
    // Add rate limit headers
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', config.max.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetIn / 1000).toString());
    
    return response;
  };
}

/**
 * Auth rate limiting (stricter)
 */
export const authRateLimit = rateLimitMiddleware('auth');

/**
 * Webhook rate limiting
 */
export const webhookRateLimit = rateLimitMiddleware('webhooks');

/**
 * Admin rate limiting
 */
export const adminRateLimit = rateLimitMiddleware('admin');

/**
 * Cleanup expired rate limit entries
 */
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);
