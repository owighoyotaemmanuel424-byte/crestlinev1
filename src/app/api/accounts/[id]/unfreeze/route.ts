import { NextResponse } from 'next/server';
import { AccountService } from '@/lib/services/account-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, operatorMiddleware } from '@/lib/middleware/auth';

// ============================================
// POST /api/accounts/:id/unfreeze
// Unfreeze an account (operator/admin only)
// ============================================

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    
    const result = await AccountService.unfreezeAccount(params.id, user.id);
    
    return success(result);
  });
}
