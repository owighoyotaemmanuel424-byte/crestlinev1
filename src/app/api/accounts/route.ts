import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountService } from '@/lib/services/account-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';
import { zDecimal, schemas } from '@/lib/middleware/validation';

// ============================================
// GET /api/accounts
// List user accounts with pagination
// ============================================

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    
    const result = await AccountService.listAccounts(user.id, { page, limit, status });
    
    return paginated(result.accounts, result.page, result.limit, result.total);
  });
}

// ============================================
// POST /api/accounts
// Create a new account
// ============================================

const createAccountSchema = z.object({
  accountNumber: z.string().optional(),
  name: z.string().min(1),
  currency: z.string().length(3),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CURRENT', 'LOAN', 'INVESTMENT', 'ESCROW', 'CREDIT']),
  initialBalance: zDecimal.optional().default(new Decimal(0)),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createAccountSchema.parse(body);
    
    const ACCOUNT_TYPE_ALIASES: Record<
      string,
      'CHECKING' | 'SAVINGS' | 'LOAN' | 'INVESTMENT' | 'CREDIT'
    > = {
      CHECKING: 'CHECKING',
      SAVINGS: 'SAVINGS',
      CURRENT: 'CHECKING',
      LOAN: 'LOAN',
      INVESTMENT: 'INVESTMENT',
      ESCROW: 'SAVINGS',
      CREDIT: 'CREDIT',
    };
    const result = await AccountService.createAccount({
      userId: user.id,
      accountNumber: validated.accountNumber,
      name: validated.name,
      currency: validated.currency,
      accountType: ACCOUNT_TYPE_ALIASES[validated.accountType],
      openingBalance: validated.initialBalance,
    }, user.id);
    
    return success(result);
  });
}