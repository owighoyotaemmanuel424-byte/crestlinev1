import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { prisma } from '@/lib/prisma';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getConsoleSecret, signAuthToken } from '@/lib/utils/security';
import { ForbiddenError } from '@/lib/utils/errors';
import { isConsoleRole } from '@/lib/console';
import { consoleOperator, matchesMasterKey } from '@/lib/admin/console-env';

// ============================================
// POST /api/auth/admin/login
// Sign in to the internal operations console.
// Same credential store as the customer app, but the account must hold a
// privileged role — otherwise the request is rejected before any token is
// issued. A configured console master key (ADMIN_MASTER_KEY) can sign the
// operator account in when the stored password is unknown.
// ============================================

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceInfo: z
    .object({
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    })
    .optional(),
});

function consoleUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
    status: user.status,
  };
}

/**
 * Break-glass sign-in with the console master key.
 *
 * Only the operator account named by ADMIN_DEFAULT_EMAIL can use it, so the
 * key never becomes a universal console credential. The attempt is written to
 * the audit trail and raises a security notification for the operator.
 */
async function masterKeySignIn(email: string) {
  const config = consoleOperator();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !isConsoleRole(user.role) || user.status !== 'ACTIVE') {
    throw new ForbiddenError('The console master key is not enabled for this account');
  }

  const { session } = await AuthService.createSession(user.id);

  try {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: { method: 'master-key', notificationEmail: config.notificationEmail },
        status: 'SUCCESS',
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Console master key used',
        message: `The console master key signed in as ${user.email}. Rotate it if this was not you.`,
        type: 'WARNING',
        category: 'SECURITY',
        metadata: { notificationEmail: config.notificationEmail },
      },
    });
  } catch {
    // A failed alert must never block the operator from recovering access.
  }

  return { user, session };
}

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const body = await request.json();
    const validated = adminLoginSchema.parse(body);
    const email = validated.email.toLowerCase().trim();
    const config = consoleOperator();

    const usingMasterKey =
      matchesMasterKey(validated.password, config.masterKey) && email === config.email;

    const result = usingMasterKey
      ? await masterKeySignIn(email)
      : await AuthService.login({
          email,
          password: validated.password,
          ipAddress: validated.deviceInfo?.ipAddress,
          userAgent: validated.deviceInfo?.userAgent,
        });

    if (!isConsoleRole(result.user.role)) {
      // A customer credential must never open the operations console, even
      // when the password was correct.
      throw new ForbiddenError('This account does not have console access');
    }

    return success({
      user: consoleUser(result.user),
      session: result.session,
      token: signAuthToken(
        {
          userId: result.user.id,
          role: result.user.role,
          email: result.user.email,
        },
        getConsoleSecret()
      ),
    });
  });
}
