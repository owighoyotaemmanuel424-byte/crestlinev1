import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountService } from '@/lib/services/account-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';
import { schemas } from '@/lib/middleware/validation';

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
  accountType: z.enum(['SAVINGS', 'CURRENT', 'LOAN', 'INVESTMENT', 'ESCROW']),
  initialBalance: zDecimal.optional().default(new Decimal(0)),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createAccountSchema.parse(body);
    
    const result = await AccountService.createAccount({
      userId: user.id,
      accountNumber: validated.accountNumber,
      name: validated.name,
      currency: validated.currency,
      accountType: validated.accountType,
      openingBalance: validated.initialBalance,
    }, user.id);
    
    return success(result);
  });
}
