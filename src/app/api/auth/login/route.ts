import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { success, error } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';

// ============================================
// POST /api/auth/login
// Login with email and password
// ============================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceInfo: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const body = await request.json();
    const validated = loginSchema.parse(body);
    
    const result = await AuthService.login({
      email: validated.email,
      password: validated.password,
      ipAddress: validated.deviceInfo?.ipAddress,
      userAgent: validated.deviceInfo?.userAgent,
    });
    
    return success(result);
  });
}
