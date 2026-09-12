import { NextResponse } from 'next/server';
import { LedgerService } from '@/lib/services/ledger-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/admin/ledger/journals - List journal entries (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const reference = searchParams.get('reference');
    const status = searchParams.get('status') as any;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    const result = await LedgerService.listJournals(
      user.id,
      page,
      limit,
      reference,
      status,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
    
    return paginated(result.journals, result.page, result.limit, result.total);
  });
}
