import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { DepositService } from '@/lib/services/deposit-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';
import { zDecimal } from '@/lib/middleware/validation';

// ============================================
// GET /api/deposits
// List user deposits with pagination
// ============================================

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    
    const result = await DepositService.listDeposits(user.id, { page, limit, status });
    
    return paginated(result.deposits, result.page, result.limit, result.total);
  });
}

// ============================================
// POST /api/deposits
// Create a new deposit
// ============================================

const createDepositSchema = z.object({
  accountId: z.string().uuid(),
  amount: zDecimal,
  currency: z.string().length(3),
  paymentMethod: z.string(),
  paymentReference: z.string(),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createDepositSchema.parse(body);
    
    const DEPOSIT_METHOD_ALIASES: Record<
      string,
      'ACH' | 'WIRE' | 'CARD' | 'CASH' | 'CHECK' | 'MOBILE' | 'CRYPTO'
    > = {
      ACH: 'ACH',
      WIRE: 'WIRE',
      BANK_TRANSFER: 'WIRE',
      CARD: 'CARD',
      CASH: 'CASH',
      CHECK: 'CHECK',
      MOBILE: 'MOBILE',
      MOBILE_MONEY: 'MOBILE',
      USSD: 'MOBILE',
      CRYPTO: 'CRYPTO',
    };

    const result = await DepositService.createDeposit({
      userId: user.id,
      accountId: validated.accountId,
      amount: validated.amount,
      currency: validated.currency,
      method: DEPOSIT_METHOD_ALIASES[validated.paymentMethod] ?? 'ACH',
      transactionReference: validated.paymentReference,
      description: validated.description,
      metadata: validated.metadata,
    }, user.id);
    
    return success(result);
  });
}