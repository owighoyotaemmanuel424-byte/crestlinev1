import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { LoanService } from '@/lib/services/loan-service';
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

// GET /api/loans - List user loans
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    
    const result = await LoanService.listLoans(user.id, user.id, page, limit, status);
    return paginated(result.loans, result.page, result.limit, result.total);
  });
}

// POST /api/loans - Apply for a loan
const applyLoanSchema = z.object({
  amount: zDecimal,
  currency: z.string().length(3),
  purpose: z.string().min(1),
  termMonths: z.number().int().positive().max(60),
  collateral: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = applyLoanSchema.parse(body);
    
    const result = await LoanService.createLoan({
      userId: user.id,
      accountId: user.id,
      loanType: 'PERSONAL',
      amount: validated.amount,
      currency: validated.currency,
      durationDays: validated.termMonths * 30,
      description: validated.purpose,
      metadata: validated.metadata,
    }, user.id);
    
    return success(result);
  });
}
