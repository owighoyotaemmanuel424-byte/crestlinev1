import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { generateToken, generateShortCode } from '../utils/security';
import type { SecuritySettings, User } from '@prisma/client';

export interface UpdateSecuritySettingsData {
  twoFactorEnabled?: boolean;
  loginAlerts?: boolean;
  transactionAlerts?: boolean;
  ipWhitelist?: string[];
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export interface SecuritySettingsResult {
  settings: SecuritySettings & { user?: Partial<User> };
}

export class SecurityService {
  static async getSecuritySettings(userId: string, actingUserId?: string): Promise<SecuritySettingsResult> {
    const settings = await prisma.securitySettings.findUnique({
      where: { userId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    if (!settings) {
      throw new NotFoundError('Security Settings', userId);
    }

    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these security settings');
      }
    }

    return { settings };
  }

  static async updateSecuritySettings(
    userId: string,
    data: UpdateSecuritySettingsData,
    actingUserId?: string
  ): Promise<SecuritySettingsResult> {
    const existingSettings = await prisma.securitySettings.findUnique({ where: { userId } });
    if (!existingSettings) throw new NotFoundError('Security Settings', userId);

    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can update security settings for other users');
      }
    }

    const settings = await prisma.securitySettings.update({
      where: { userId },
      data,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || userId,
        action: 'UPDATE',
        resourceType: 'SECURITY_SETTINGS',
        resourceId: settings.id,
        oldValues: { twoFactorEnabled: existingSettings.twoFactorEnabled },
        newValues: { twoFactorEnabled: settings.twoFactorEnabled },
        status: 'SUCCESS',
      },
    });

    return { settings };
  }

  static async changePassword(userId: string, data: ChangePasswordData): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const isValidPassword = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValidPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    if (data.newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'CHANGE_PASSWORD',
        resourceType: 'USER',
        resourceId: userId,
        status: 'SUCCESS',
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: 'Password Changed',
        message: 'Your password has been successfully changed.',
        type: 'SUCCESS' as const,
        category: 'SECURITY' as const,
        isRead: false,
      },
    });
  }

  static async enableTwoFactor(userId: string): Promise<{ secret: string; backupCodes: string[] }> {
    const settings = await prisma.securitySettings.findUnique({ where: { userId } });
    if (!settings) throw new NotFoundError('Security Settings', userId);

    const secret = generateToken(32);
    const backupCodes = Array.from({ length: 5 }, () => generateShortCode(8));

    await prisma.securitySettings.update({
      where: { userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: secret,
        backupCodes: JSON.stringify(backupCodes),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ENABLE_2FA',
        resourceType: 'SECURITY_SETTINGS',
        resourceId: settings.id,
        status: 'SUCCESS',
      },
    });

    return { secret, backupCodes };
  }

  static async confirmTwoFactor(userId: string, code: string): Promise<void> {
    const settings = await prisma.securitySettings.findUnique({ where: { userId } });
    if (!settings) throw new NotFoundError('Security Settings', userId);

    if (code.length !== 6) {
      throw new ValidationError('Invalid 2FA code');
    }

    await prisma.securitySettings.update({
      where: { userId },
      data: { twoFactorEnabled: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'CONFIRM_2FA',
        resourceType: 'SECURITY_SETTINGS',
        resourceId: settings.id,
        status: 'SUCCESS',
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: 'Two-Factor Authentication Enabled',
        message: 'Two-factor authentication has been successfully enabled for your account.',
        type: 'SUCCESS' as const,
        category: 'SECURITY' as const,
        isRead: false,
      },
    });
  }

  static async disableTwoFactor(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new ValidationError('Password is incorrect');
    }

    await prisma.securitySettings.update({
      where: { userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'DISABLE_2FA',
        resourceType: 'SECURITY_SETTINGS',
        resourceId: userId,
        status: 'SUCCESS',
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: 'Two-Factor Authentication Disabled',
        message: 'Two-factor authentication has been disabled for your account.',
        type: 'WARNING' as const,
        category: 'SECURITY' as const,
        isRead: false,
      },
    });
  }

  static async verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
    const settings = await prisma.securitySettings.findUnique({ where: { userId } });
    if (!settings || !settings.twoFactorEnabled) {
      return false;
    }

    if (settings.backupCodes) {
      const backupCodes: string[] = JSON.parse(settings.backupCodes);
      if (backupCodes.includes(code)) {
        const updatedBackupCodes = backupCodes.filter(c => c !== code);
        await prisma.securitySettings.update({
          where: { userId },
          data: { backupCodes: JSON.stringify(updatedBackupCodes) },
        });
        return true;
      }
    }

    return code.length === 6;
  }

  static async getLoginHistory(userId: string, page: number = 1, limit: number = 20) {
    const history = await prisma.auditLog.findMany({
      where: {
        actorId: userId,
        action: 'LOGIN',
        resourceType: 'USER',
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.auditLog.count({
      where: {
        actorId: userId,
        action: 'LOGIN',
        resourceType: 'USER',
      },
    });

    return { history, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getSecurityAlerts(userId: string, page: number = 1, limit: number = 20) {
    const alerts = await prisma.auditLog.findMany({
      where: {
        actorId: userId,
        action: { in: ['LOGIN', 'FREEZE', 'UNFREEZE', 'CHANGE_PASSWORD', 'RESET_PASSWORD'] },
        resourceType: { in: ['USER', 'ACCOUNT', 'CARD', 'SECURITY_SETTINGS'] },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.auditLog.count({
      where: {
        actorId: userId,
        action: { in: ['LOGIN', 'FREEZE', 'UNFREEZE', 'CHANGE_PASSWORD', 'RESET_PASSWORD'] },
        resourceType: { in: ['USER', 'ACCOUNT', 'CARD', 'SECURITY_SETTINGS'] },
      },
    });

    return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async addTrustedDevice(userId: string, deviceId: string, deviceName: string): Promise<void> {
    const settings = await prisma.securitySettings.findUnique({ where: { userId } });
    if (!settings) throw new NotFoundError('Security Settings', userId);

    const trustedDevices: Record<string, string> = {};
    settings.ipWhitelist?.forEach(ip => { trustedDevices[ip] = deviceName; });
    trustedDevices[deviceId] = deviceName;

    await prisma.securitySettings.update({
      where: { userId },
      data: { ipWhitelist: Object.keys(trustedDevices) },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ADD_TRUSTED_DEVICE',
        resourceType: 'SECURITY_SETTINGS',
        resourceId: settings.id,
        metadata: { deviceId, deviceName },
        status: 'SUCCESS',
      },
    });
  }

  static async removeTrustedDevice(userId: string, deviceId: string): Promise<void> {
    const settings = await prisma.securitySettings.findUnique({ where: { userId } });
    if (!settings) throw new NotFoundError('Security Settings', userId);

    const trustedDevices = settings.ipWhitelist?.filter(ip => ip !== deviceId) || [];

    await prisma.securitySettings.update({
      where: { userId },
      data: { ipWhitelist: trustedDevices },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'REMOVE_TRUSTED_DEVICE',
        resourceType: 'SECURITY_SETTINGS',
        resourceId: settings.id,
        metadata: { deviceId },
        status: 'SUCCESS',
      },
    });
  }
}