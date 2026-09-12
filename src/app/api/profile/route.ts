import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ProfileService } from '@/lib/services/profile-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/profile - Get user profile
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const result = await ProfileService.getProfile(user.id);
    return success(result);
  });
}

// PATCH /api/profile - Update user profile
const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function PATCH(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = updateProfileSchema.parse(body);
    
    const result = await ProfileService.updateProfile(user.id, validated, user.id);
    return success(result);
  });
}
