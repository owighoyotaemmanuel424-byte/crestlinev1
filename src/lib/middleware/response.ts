import { NextResponse } from 'next/server';

// ============================================
// API RESPONSE UTILITIES
// ============================================

/**
 * Standard success response format
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Standard paginated response format
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Create a success response
 */
export function success<T>(data: T, meta?: SuccessResponse<T>['meta']): NextResponse {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };
  
  return NextResponse.json(response, { status: 200 });
}

/**
 * Create a paginated response
 */
export function paginated<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): NextResponse {
  const totalPages = Math.ceil(total / limit);
  
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
  
  return NextResponse.json(response, { status: 200 });
}

/**
 * Create a created response (201)
 */
export function created<T>(data: T): NextResponse {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };
  
  return NextResponse.json(response, { status: 201 });
}

/**
 * Create a no content response (204)
 */
export function noContent(): NextResponse {
  return NextResponse.json(null, { status: 204 });
}

/**
 * Create an accepted response (202) for async operations
 */
export function accepted<T>(data: T): NextResponse {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };
  
  return NextResponse.json(response, { status: 202 });
}

/**
 * Standard error response (already handled by error-handler)
 * Kept for explicit error returns
 */
export function error(
  error: string,
  message: string,
  status: number = 400,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      message,
      ...(details && { details }),
    },
    { status }
  );
}

/**
 * Set common response headers
 */
export function withHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * CORS headers
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Cache control headers
 */
export const cacheHeaders = {
  noStore: {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  },
  short: {
    'Cache-Control': 'public, max-age=60',
  },
  long: {
    'Cache-Control': 'public, max-age=86400',
  },
};
