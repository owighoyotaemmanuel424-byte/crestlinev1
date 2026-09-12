import { NextResponse } from 'next/server';
import { WithdrawalService } from '@/lib/services/withdrawal-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/admin/withdrawals - List all withdrawals (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    const result = await WithdrawalService.listAllWithdrawals(user.id, {
      page,
      limit,
      status,
      userId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    
    return paginated(result.withdrawals, result.page, result.limit, result.total);
  });
}
