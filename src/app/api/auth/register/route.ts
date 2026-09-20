import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { signAuthToken } from '@/lib/utils/security';

// ============================================
// POST /api/auth/register
// Create a customer account and start a session
// ============================================

const registerSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().min(6).max(20).optional(),
});

function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  status: string;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
  };
}

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const body = await request.json();
    const validated = registerSchema.parse(body);

    const result = await AuthService.register({
      email: validated.email,
      password: validated.password,
      firstName: validated.firstName,
      lastName: validated.lastName,
      phone: validated.phone,
    });

    return success({
      user: publicUser(result.user),
      session: result.session,
      token: signAuthToken({
        userId: result.user.id,
        role: result.user.role,
        email: result.user.email,
      }),
    });
  });
}
