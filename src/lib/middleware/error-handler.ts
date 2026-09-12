import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  InsufficientBalanceError,
  AppError,
} from '../utils/errors';

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  code?: string;
}

/**
 * Map errors to HTTP status codes
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof ValidationError) return 400;
  if (error instanceof ConflictError) return 409;
  if (error instanceof InsufficientBalanceError) return 400;
  if (error instanceof AppError) return error.statusCode || 400;
  return 500;
}

/**
 * Format error for API response
 */
export function formatError(error: unknown): ErrorResponse {
  if (error instanceof NotFoundError) {
    return {
      error: 'NotFoundError',
      message: error.message,
      details: { resource: error.resourceType, id: error.resourceId },
    };
  }
  
  if (error instanceof ForbiddenError) {
    return {
      error: 'ForbiddenError',
      message: error.message,
    };
  }
  
  if (error instanceof ValidationError) {
    return {
      error: 'ValidationError',
      message: error.message,
      details: error.details,
    };
  }
  
  if (error instanceof ConflictError) {
    return {
      error: 'ConflictError',
      message: error.message,
      details: { resource: error.resourceType, id: error.resourceId },
    };
  }
  
  if (error instanceof InsufficientBalanceError) {
    return {
      error: 'InsufficientBalanceError',
      message: error.message,
      details: {
        accountId: error.accountId,
        required: error.requiredAmount,
        available: error.availableBalance,
      },
    };
  }
  
  if (error instanceof AppError) {
    return {
      error: error.name,
      message: error.message,
      code: error.code,
    };
  }
  
  if (error instanceof Error) {
    return {
      error: 'InternalServerError',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
    };
  }
  
  return {
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  };
}

/**
 * Error handling middleware wrapper for API routes
 * Usage: wrap your route handler with this
 */
export function withErrorHandler(
  handler: (request: NextRequest, context?: { params: Record<string, string> }) => Promise<Response>
) {
  return async function (request: NextRequest, context?: { params: Record<string, string> }) {
    try {
      return await handler(request, context);
    } catch (error) {
      const statusCode = getStatusCode(error);
      const errorResponse = formatError(error);
      
      // Log error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('API Error:', error);
      }
      
      return NextResponse.json(errorResponse, { status: statusCode });
    }
  };
}

/**
 * Async error handler for route functions
 */
export async function handleRouteError(
  request: NextRequest,
  context: { params: Record<string, string> },
  handler: () => Promise<Response | NextResponse>
): Promise<Response | NextResponse> {
  try {
    return await handler();
  } catch (error) {
    const statusCode = getStatusCode(error);
    const errorResponse = formatError(error);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Route Error:', error);
    }
    
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
