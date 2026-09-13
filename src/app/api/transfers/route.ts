import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { TransferService } from '@/lib/services/transfer-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// DECIMAL UTILITIES FOR ZOD
// ============================================

/**
 * Custom Zod schema for Decimal that accepts number, string, or Decimal
 * and converts to Decimal for safe financial arithmetic
 */
const zDecimal = z.custom<Decimal>(
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
  if (typeof val === 'number') return new Decimal(val.toString());
  return val;
});

// ============================================
// GET /api/transfers
// List user transfers with pagination
// ============================================

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    
    const result = await TransferService.listTransfers(user.id, { page, limit, status });
    
    return paginated(result.transfers, result.page, result.limit, result.total);
  });
}

// ============================================
// POST /api/transfers
// Create a new transfer
// ============================================

const createTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: zDecimal,
  currency: z.string().length(3),
  description: z.string().min(1),
  reference: z.string().optional(),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createTransferSchema.parse(body);
    
    const result = await TransferService.createTransfer({
      fromAccountId: validated.fromAccountId,
      toAccountId: validated.toAccountId,
      amount: validated.amount,
      currency: validated.currency,
      description: validated.description,
      reference: validated.reference,
      idempotencyKey: validated.idempotencyKey,
      metadata: validated.metadata,
    }, user.id);
    
    return success(result);
  });
}
