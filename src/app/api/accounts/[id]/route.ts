import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccountService } from '@/lib/services/account-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// GET /api/accounts/:id
// Get account details by ID
// ============================================

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    
    const result = await AccountService.getAccountById(params.id, user.id);
    
    return success(result);
  });
}

// ============================================
// PATCH /api/accounts/:id
// Update account details
// ============================================

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = updateAccountSchema.parse(body);
    
    const result = await AccountService.updateAccount(
      params.id,
      validated,
      user.id
    );
    
    return success(result);
  });
}

// ============================================
// DELETE /api/accounts/:id
// Close an account
// ============================================

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    
    const result = await AccountService.closeAccount(params.id, user.id);
    
    return success(result);
  });
}
