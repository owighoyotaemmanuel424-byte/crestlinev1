import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccountService } from '@/lib/services/account-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, adminMiddleware } from '@/lib/middleware/auth';

// GET /api/admin/accounts - List all accounts (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const userId = searchParams.get('userId');
    
    const result = await AccountService.listAllAccounts(user.id, { page, limit, status, userId: userId ?? undefined });
    return paginated(result.accounts, result.page, result.limit, result.total);
  });
}
