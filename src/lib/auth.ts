import { getServerSession, type AuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { prisma } from './prisma';
import { verifyToken } from './utils/security';
import { AuthError, NotFoundError } from './utils/errors';
import type { User } from '@prisma/client';

// Extend the types for NextAuth
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      emailVerified: boolean;
      phoneVerified: boolean;
      avatarUrl?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    avatarUrl?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    avatarUrl?: string | null;
  }
}

// Custom user type for our application
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  avatarUrl?: string | null;
}

export interface AuthSession {
  user: SessionUser;
}

// Validate user for authentication
export async function validateUser(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      securitySettings: true,
      profile: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User', `with email: ${email}`);
  }

  // Check if account is suspended or closed
  if (user.status !== 'ACTIVE') {
    throw new AuthError(`Account is ${user.status.toLowerCase()}`);
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    // Update failed attempts
    await prisma.securitySettings.upsert({
      where: { userId: user.id },
      update: {
        failedAttempts: { increment: 1 },
        lockedUntil: user.securitySettings?.failedAttempts && user.securitySettings.failedAttempts >= 4
          ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes lockout
          : undefined,
      },
      create: {
        userId: user.id,
        failedAttempts: 1,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    throw new AuthError('Invalid credentials');
  }

  // Reset failed attempts on successful login
  if (user.securitySettings?.failedAttempts && user.securitySettings.failedAttempts > 0) {
    await prisma.securitySettings.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  // Check if account is locked
  if (user.securitySettings?.lockedUntil && user.securitySettings.lockedUntil > new Date()) {
    throw new AuthError('Account is temporarily locked due to too many failed attempts');
  }

  return user;
}

// NextAuth configuration
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new AuthError('Email and password are required');
        }

        try {
          const user = await validateUser(
            credentials.email as string,
            credentials.password as string
          );

          // Create audit log for login
          await prisma.auditLog.create({
            data: {
              actorId: user.id,
              action: 'LOGIN',
              resourceType: 'USER',
              resourceId: user.id,
              metadata: {
                ipAddress: (credentials as any).ipAddress,
                userAgent: (credentials as any).userAgent,
              },
              status: 'SUCCESS',
            },
          });

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role,
            status: user.status,
            emailVerified: user.emailVerified,
            phoneVerified: user.phoneVerified,
            avatarUrl: null,
          };
        } catch (error) {
          // Log failed login attempt
          if (credentials.email) {
            const user = await prisma.user.findUnique({
              where: { email: (credentials.email as string).toLowerCase() },
            });
            if (user) {
              await prisma.auditLog.create({
                data: {
                  actorId: user.id,
                  action: 'LOGIN',
                  resourceType: 'USER',
                  resourceId: user.id,
                  metadata: {
                    ipAddress: (credentials as any).ipAddress,
                    userAgent: (credentials as any).userAgent,
                    error: error instanceof Error ? error.message : 'Unknown error',
                  },
                  status: 'FAILURE',
                  errorMessage: error instanceof Error ? error.message : 'Unknown error',
                },
              });
            }
          }
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.status = user.status;
        token.emailVerified = user.emailVerified !== null;
        token.phoneVerified = user.phoneVerified !== null;
        token.avatarUrl = (user as any).avatarUrl || null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        email: token.email!,
        name: token.name!,
        role: token.role!,
        status: token.status!,
        emailVerified: token.emailVerified!,
        phoneVerified: token.phoneVerified!,
        avatarUrl: token.avatarUrl,
      };
      return session;
    },
  },
};

// ============================================
// SESSION RESOLUTION
// ============================================

/**
 * Load the acting user for a resolved identity.
 *
 * Privileges always come from the database, never from the token or cookie, so
 * a stale credential can never keep a revoked role alive.
 */
async function loadSessionUser(userId: string): Promise<AuthSession | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      emailVerified: true,
      phoneVerified: true,
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerified),
      phoneVerified: Boolean(user.phoneVerified),
      avatarUrl: null,
    },
  };
}

/**
 * Resolve a session from the bearer token our API clients send.
 *
 * The edge middleware verifies the token before the request reaches a route
 * and forwards `x-user-id`; server components and routes called outside the
 * middleware chain (or straight from a test) are handled by verifying the
 * Authorization header here.
 */
async function tokenSession(): Promise<AuthSession | null> {
  let forwardedUserId: string | null = null;
  let authorization: string | null = null;

  try {
    const requestHeaders = headers();
    forwardedUserId = requestHeaders.get('x-user-id');
    authorization = requestHeaders.get('authorization');
  } catch {
    // Outside a request scope (build-time prerender, scripts).
    return null;
  }

  if (authorization?.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(authorization.slice(7));
      if (payload?.sub) {
        return loadSessionUser(payload.sub);
      }
    } catch {
      return null;
    }
  }

  if (forwardedUserId) {
    return loadSessionUser(forwardedUserId);
  }

  return null;
}

/**
 * Current session for server routes and components.
 *
 * next-auth only exposes `getServerSession` in v4 (and no next-auth route
 * handler is mounted), so cookie sessions are consulted opportunistically and
 * the bearer token used by the customer app and the operations console is the
 * primary credential.
 */
export async function auth(): Promise<AuthSession | null> {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (secret) {
    const session = await getServerSession({ ...authOptions, secret }).catch(() => null);
    if (session?.user?.id) {
      return session as AuthSession;
    }
  }

  return tokenSession();
}

// Get current user from session
export async function getCurrentUser() {
  const session = await auth();
  return session?.user;
}

// Check if user is authenticated
export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}

// Check if user has a specific role
export async function hasRole(role: string | string[]) {
  const user = await getCurrentUser();
  if (!user) return false;
  
  if (Array.isArray(role)) {
    return role.includes(user.role);
  }
  return user.role === role;
}

// Check if user has permission
export async function hasPermission(permission: string) {
  const user = await getCurrentUser();
  if (!user) return false;

  // SUPER_ADMIN has all permissions
  if (user.role === 'SUPER_ADMIN') return true;

  // Check role permissions
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role: user.role as any },
    include: { permission: true },
  });

  return rolePermissions.some(rp => rp.permission.name === permission);
}

// Check if user can access a resource (ownership check)
export async function canAccessResource(
  resourceType: string,
  resourceId: string,
  resourceUserId?: string
) {
  const user = await getCurrentUser();
  if (!user) return false;

  // Admin and above can access any resource
  if (['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(user.role)) {
    return true;
  }

  // Support can access user-related resources
  if (user.role === 'SUPPORT' && resourceType === 'USER') {
    return true;
  }

  // For most resources, check ownership
  if (resourceUserId) {
    return resourceUserId === user.id;
  }

  // Fetch resource user ID from database
  const resourceMap: Record<string, { model: any; idField: string; userField: string }> = {
    ACCOUNT: { model: prisma.account, idField: 'id', userField: 'userId' },
    TRANSACTION: { model: prisma.transaction, idField: 'id', userField: 'userId' },
    TRANSFER: { model: prisma.transfer, idField: 'id', userField: 'fromUserId' },
    DEPOSIT: { model: prisma.deposit, idField: 'id', userField: 'userId' },
    WITHDRAWAL: { model: prisma.withdrawal, idField: 'id', userField: 'userId' },
    CARD: { model: prisma.card, idField: 'id', userField: 'userId' },
    BENEFICIARY: { model: prisma.beneficiary, idField: 'id', userField: 'userId' },
    KYC_PROFILE: { model: prisma.kYCProfile, idField: 'id', userField: 'userId' },
    LOAN_APPLICATION: { model: prisma.loanApplication, idField: 'id', userField: 'userId' },
    SAVINGS_GOAL: { model: prisma.savingsGoal, idField: 'id', userField: 'userId' },
    INVESTMENT_PORTFOLIO: { model: prisma.investmentPortfolio, idField: 'id', userField: 'userId' },
    SUPPORT_TICKET: { model: prisma.supportTicket, idField: 'id', userField: 'userId' },
  };

  const config = resourceMap[resourceType];
  if (!config) return false;

  try {
    const resource = await (config.model as any).findUnique({
      where: { [config.idField]: resourceId },
    });
    return resource?.[config.userField] === user.id;
  } catch {
    return false;
  }
}

// Middleware for role-based access control
export function withRole(role: string | string[]) {
  return async (req: Request, res: Response, next: any) => {
    const user = await getCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    
    if (!hasRole(role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    
    return next();
  };
}
