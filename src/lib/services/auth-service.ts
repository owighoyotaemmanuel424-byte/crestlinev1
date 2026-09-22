import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import { generateToken, generateIdempotencyKey } from '../utils/security';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, AuthError } from '../utils/errors';
import type { User, Session, UserStatus, Role } from '@prisma/client';

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}

export interface LoginData {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: User;
  session: Session;
  token: string;
}

export interface SessionResult {
  session: Session;
  user: User;
}

// In-memory password-reset tokens (the User model has no reset-token columns).
const pendingPasswordResets = new Map<string, { userId: string; expires: Date }>();

export class AuthService {
  static async listUsers(
    actingUserId: string,
    options: { page?: number; limit?: number; role?: Role; status?: UserStatus; search?: string } = {}
  ) {
    return this.getAllUsers(
      actingUserId,
      options.page ?? 1,
      options.limit ?? 20,
      options.search,
      options.role,
      options.status
    );
  }

  static async refreshToken(sessionToken: string) {
    return this.refreshSession(sessionToken);
  }

  static async register(data: RegisterData, actingUserId?: string): Promise<AuthResult> {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    if (data.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        password: hashedPassword,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone?.trim(),
        role: (data.role as Role | undefined) ?? ('CUSTOMER' as Role),
        status: 'ACTIVE' as UserStatus,
      },
    });

    const { session, token } = await this.createSession(user.id, data.ipAddress, data.userAgent);

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId ?? user.id,
        action: 'REGISTER',
        resourceType: 'USER',
        resourceId: user.id,
        newValues: { email: user.email, firstName: user.firstName, lastName: user.lastName },
        status: 'SUCCESS',
      },
    });

    return { user, session, token };
  }

  static async login(data: LoginData): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase().trim() } });
    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthError('Account is not active');
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password);
    if (!isValidPassword) {
      throw new AuthError('Invalid email or password');
    }

    const { session, token } = await this.createSession(user.id, data.ipAddress, data.userAgent);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: { ipAddress: data.ipAddress ?? null, userAgent: data.userAgent ?? null },
        status: 'SUCCESS',
      },
    });

    return { user, session, token };
  }

  static async logout(sessionToken: string): Promise<void> {
    await prisma.session.deleteMany({ where: { sessionToken } });

    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'LOGOUT',
        resourceType: 'SESSION',
        resourceId: sessionToken,
        status: 'SUCCESS',
      },
    });
  }

  static async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<{ session: Session; token: string }> {
    const sessionToken = generateToken(32);
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires,
        ipAddress,
        userAgent,
      },
    });

    return { session, token: sessionToken };
  }

  static async validateSession(sessionToken: string): Promise<SessionResult | null> {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    if (session.expires < new Date()) {
      await prisma.session.delete({ where: { sessionToken } });
      return null;
    }

    return { session, user: session.user };
  }

  static async refreshSession(sessionToken: string, ipAddress?: string, userAgent?: string): Promise<{ session: Session; token: string }> {
    const existingSession = await prisma.session.findUnique({ where: { sessionToken } });
    if (!existingSession) {
      throw new AuthError('Invalid session');
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const session = await prisma.session.update({
      where: { sessionToken },
      data: {
        expires,
        ipAddress,
        userAgent,
      },
    });

    return { session, token: sessionToken };
  }

  static async getUserById(id: string, actingUserId?: string): Promise<User> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User', id);

    if (actingUserId && actingUserId !== id) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this user');
      }
    }

    return user;
  }

  static async getAllUsers(actingUserId: string, page: number = 1, limit: number = 20, search?: string, role?: Role, status?: UserStatus): Promise<{ users: User[]; total: number; page: number; limit: number; totalPages: number }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can view all users');
    }

    const where: any = {};
    if (search) where.email = { contains: search, mode: 'insensitive' };
    if (role) where.role = role;
    if (status) where.status = status;

    const users = await prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.user.count({ where });

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async updateUser(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: UserStatus; role?: Role }, actingUserId: string): Promise<User> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User', id);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can update users');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'USER',
        resourceId: user.id,
        oldValues: { firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status },
        newValues: { firstName: data.firstName || user.firstName, lastName: data.lastName || user.lastName, role: data.role || user.role, status: data.status || user.status },
        status: 'SUCCESS',
      },
    });

    return updatedUser;
  }

  static async resetPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      return;
    }

    const resetToken = generateToken(32);
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 1);

    // User has no reset-token columns; keep tokens in-memory for this runtime
    // until persistent reset-token storage is added to the schema.
    pendingPasswordResets.set(resetToken, { userId: user.id, expires: resetTokenExpires });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'RESET_PASSWORD_REQUEST',
        resourceType: 'USER',
        resourceId: user.id,
        status: 'SUCCESS',
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Password Reset Request',
        message: 'A password reset has been requested for your account.',
        type: 'INFO' as const,
        category: 'SECURITY' as const,
        isRead: false,
      },
    });
  }

  static async completePasswordReset(token: string, newPassword: string): Promise<void> {
    const pending = pendingPasswordResets.get(token);
    if (!pending || pending.expires < new Date()) {
      pendingPasswordResets.delete(token);
      throw new AuthError('Invalid or expired reset token');
    }

    const user = await prisma.user.findUnique({ where: { id: pending.userId } });
    if (!user) {
      throw new AuthError('Invalid reset token');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    pendingPasswordResets.delete(token);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'RESET_PASSWORD',
        resourceType: 'USER',
        resourceId: user.id,
        status: 'SUCCESS',
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Password Reset Complete',
        message: 'Your password has been successfully reset.',
        type: 'SUCCESS' as const,
        category: 'SECURITY' as const,
        isRead: false,
      },
    });
  }
}

// Instance-style bindings: tests exercise the service as an instance while
// the class API is static. Bind every static method onto the prototype.
Object.getOwnPropertyNames(AuthService)
  .filter((n) => n !== 'constructor' && n !== 'length' && n !== 'name' && n !== 'prototype' && typeof (AuthService as unknown as Record<string, unknown>)[n] === 'function')
  .forEach((n) => {
    (AuthService.prototype as unknown as Record<string, unknown>)[n] = function (this: unknown, ...args: unknown[]) {
      return (AuthService as unknown as Record<string, (...a: unknown[]) => unknown>)[n](...args);
    };
  });
