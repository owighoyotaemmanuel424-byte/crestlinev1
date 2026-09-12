import { NextResponse } from 'next/server';
import { LoanService } from '@/lib/services/loan-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/loans/:id - Get loan details
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const result = await LoanService.getLoanById(params.id, user.id);
    return success(result);
  });
}
