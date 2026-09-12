import { NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// GET /api/auth/me
// Get current authenticated user
// ============================================

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    
    const result = await AuthService.getCurrentUser(user.id);
    
    return success(result);
  });
}
