import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TransactionService } from '@/lib/services/transaction-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// GET /api/transactions
// List user transactions with pagination
// ============================================

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const type = searchParams.get('type') as any;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    const result = await TransactionService.listTransactions(user.id, {
      page,
      limit,
      status,
      type,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    
    return paginated(result.transactions, result.page, result.limit, result.total);
  });
}

// ============================================
// POST /api/transactions
// Create a new transaction
// ============================================

const createTransactionSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'INTEREST', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT']),
  amount: z.number().positive(),
  currency: z.string().length(3),
  description: z.string().min(1),
  reference: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createTransactionSchema.parse(body);
    
    const result = await TransactionService.createTransaction({
      userId: user.id,
      accountId: validated.accountId,
      type: validated.type,
      amount: validated.amount,
      currency: validated.currency,
      description: validated.description,
      reference: validated.reference,
      metadata: validated.metadata,
    }, user.id);
    
    return success(result);
  });
}
