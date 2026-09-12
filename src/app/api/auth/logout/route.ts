import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// POST /api/auth/logout
// Logout and invalidate session
// ============================================

const logoutSchema = z.object({
  allSessions: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = logoutSchema.parse(body);
    
    const result = await AuthService.logout(user.id, validated.allSessions);
    
    return success(result);
  });
}
