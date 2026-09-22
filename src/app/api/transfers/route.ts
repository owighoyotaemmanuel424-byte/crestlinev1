import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '@/lib/prisma';
import { TransferService } from '@/lib/services/transfer-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';
import { zDecimal } from '@/lib/middleware/validation';

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
    
    const [fromAccount, toAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: validated.fromAccountId } }),
      prisma.account.findUnique({ where: { id: validated.toAccountId } }),
    ]);
    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: 'Transfer account not found' }, { status: 404 });
    }

    const result = await TransferService.createTransfer({
      fromUserId: fromAccount.userId,
      toUserId: toAccount.userId,
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