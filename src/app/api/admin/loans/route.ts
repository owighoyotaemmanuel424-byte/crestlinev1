import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LoanService } from '@/lib/services/loan-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/admin/loans - List all loans (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const userId = searchParams.get('userId');
    
    const result = await LoanService.listAllLoans(user.id, page, limit, status, userId);
    return paginated(result.loans, result.page, result.limit, result.total);
  });
}

// POST /api/admin/loans/:id/approve - Approve loan (admin only)
const approveLoanSchema = z.object({
  approvedAmount: z.number().positive().optional(),
  interestRate: z.number().positive().optional(),
  termMonths: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = approveLoanSchema.parse(body);
    
    const result = await LoanService.approveLoanApplication(
      params.id,
      {
        approvedAmount: validated.approvedAmount,
        interestRate: validated.interestRate,
        termMonths: validated.termMonths,
        notes: validated.notes,
        approvedBy: user.id,
      },
      user.id
    );
    
    return success(result);
  });
}
