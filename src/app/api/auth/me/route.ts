import { AuthService } from '@/lib/services/auth-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';
import type { User } from '@prisma/client';

// ============================================
// GET /api/auth/me
// Get current authenticated user
// ============================================

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    name: `${user.firstName} ${user.lastName}`.trim(),
  };
}

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);

    const account = await AuthService.getUserById(user.id, user.id);

    return success(publicUser(account));
  });
}
