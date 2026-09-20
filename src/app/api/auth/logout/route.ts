import { prisma } from '@/lib/prisma';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// POST /api/auth/logout
// Invalidate the signed-in session(s)
// ============================================

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);

    // The body is optional — sign-out must succeed even with no payload.
    try {
      await request.json();
    } catch {
      // Ignore malformed or empty bodies.
    }

    await prisma.session.deleteMany({ where: { userId: user.id } });

    return success({ message: 'Signed out' });
  });
}
