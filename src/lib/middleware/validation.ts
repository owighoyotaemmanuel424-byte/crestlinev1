import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z, ZodError } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { ValidationError } from '../utils/errors';

// ============================================
// REQUEST VALIDATION MIDDLEWARE
// ============================================

/**
 * Custom Zod schema for Decimal that accepts number, string, or Decimal
 * and converts to Decimal for safe financial arithmetic.
 * Use this for all monetary field validations.
 */
export const zDecimal = z.custom<Decimal>(
  (val) => {
    if (val instanceof Decimal) return true;
    if (typeof val === 'string') {
      try {
        new Decimal(val);
        return true;
      } catch {
        return false;
      }
    }
    if (typeof val === 'number') return true;
    return false;
  },
  {
    message: 'Expected a Decimal, number, or string representation of a number',
  }
).transform((val) => {
  if (val instanceof Decimal) return val;
  if (typeof val === 'string') return new Decimal(val);
  if (typeof val === 'number') return new Decimal(String(val));
  return val;
});

/**
 * Zod schemas for request validation
 */
export const schemas = {
  // Pagination schema
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Date range schema
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),

  // ID parameter schema
  idParam: z.object({
    id: z.string().uuid(),
  }),

  // Generic search schema
  search: z.object({
    query: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
  }),
};

/**
 * Validate request body against Zod schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async function (request: NextRequest) {
    try {
      const body = await request.json();
      const validated = schema.parse(body);
      
      // Store validated body in request for downstream use
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-validated-body', JSON.stringify(validated));
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: 'ValidationError',
            message: 'Invalid request body',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'ValidationError', message: 'Invalid JSON body' },
        { status: 400 }
      );
    }
  };
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async function (request: NextRequest) {
    try {
      const searchParams = request.nextUrl.searchParams;
      const query: Record<string, unknown> = {};
      
      searchParams.forEach((value, key) => {
        query[key] = value;
      });
      
      const validated = schema.parse(query);
      
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-validated-query', JSON.stringify(validated));
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: 'ValidationError',
            message: 'Invalid query parameters',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'ValidationError', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }
  };
}

/**
 * Validate path parameters
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return async function (request: NextRequest, context: { params: Record<string, string> }) {
    try {
      const validated = schema.parse(context.params);
      
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-validated-params', JSON.stringify(validated));
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: 'ValidationError',
            message: 'Invalid path parameters',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'ValidationError', message: 'Invalid path parameters' },
        { status: 400 }
      );
    }
  };
}

/**
 * Helper to extract validated data from request
 */
export function getValidatedData<T>(request: NextRequest, key: string): T {
  const data = request.headers.get(`x-validated-${key}`);
  if (!data) {
    throw new ValidationError('No validated data found');
  }
  return JSON.parse(data) as T;
}