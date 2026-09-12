import { NextResponse } from 'next/server';
import { WithdrawalService } from '@/lib/services/withdrawal-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// GET /api/withdrawals/:id
// Get withdrawal details by ID
// ============================================

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    
    const result = await WithdrawalService.getWithdrawalById(params.id, user.id);
    
    return success(result);
  });
}
