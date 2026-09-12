import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';

// ============================================
// POST /api/auth/refresh
// Refresh access token using refresh token
// ============================================

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const body = await request.json();
    const validated = refreshSchema.parse(body);
    
    const result = await AuthService.refreshToken(validated.refreshToken);
    
    return success(result);
  });
}
