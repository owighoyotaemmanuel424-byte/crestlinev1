import { NextResponse } from 'next/server';
import { DepositService } from '@/lib/services/deposit-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// GET /api/deposits/:id
// Get deposit details by ID
// ============================================

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    
    const result = await DepositService.getDepositById(params.id, user.id);
    
    return success(result);
  });
}
