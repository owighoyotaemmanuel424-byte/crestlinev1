import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { signAuthToken } from '@/lib/utils/security';

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
    const validated = loginSchema.parse(body);

    const result = await AuthService.login({
      email: validated.email,
      password: validated.password,
      ipAddress: validated.deviceInfo?.ipAddress,
      userAgent: validated.deviceInfo?.userAgent,
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
