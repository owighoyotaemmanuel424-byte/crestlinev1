import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import type { Profile, User } from '@prisma/client';

export interface CreateProfileData {
  userId: string;
  avatarUrl?: string;
  bio?: string;
  preferredLanguage?: string;
  timezone?: string;
  notificationPreferences?: Record<string, boolean>;
  privacySettings?: Record<string, boolean>;
}

export interface UpdateProfileData {
  avatarUrl?: string;
  bio?: string;
  preferredLanguage?: string;
  timezone?: string;
  notificationPreferences?: Record<string, boolean>;
  privacySettings?: Record<string, boolean>;
}

export interface ProfileResult {
  profile: Profile & { user?: Partial<User> };
}

export class ProfileService {
  static async getProfileByUserId(userId: string, actingUserId?: string): Promise<ProfileResult> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    if (!profile) {
      throw new NotFoundError('Profile', userId);
    }

    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this profile');
      }
    }

    return { profile };
  }

  static async createProfile(data: CreateProfileData, actingUserId?: string): Promise<ProfileResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can create profiles for other users');
      }
    }

    const profile = await prisma.profile.upsert({
      where: { userId: data.userId },
      update: data,
      create: {
        userId: data.userId,
        avatarUrl: data.avatarUrl,
        bio: data.bio,
        preferredLanguage: data.preferredLanguage || 'en',
        timezone: data.timezone || 'UTC',
        notificationPreferences: data.notificationPreferences || { email: true, push: true, sms: false },
        privacySettings: data.privacySettings || { showBalance: true, showTransactions: true },
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'PROFILE',
        resourceId: profile.id,
        newValues: { preferredLanguage: profile.preferredLanguage, timezone: profile.timezone },
        status: 'SUCCESS',
      },
    });

    return { profile };
  }

  static async updateProfile(
    userId: string,
    data: UpdateProfileData,
    actingUserId?: string
  ): Promise<ProfileResult> {
    const existingProfile = await prisma.profile.findUnique({ where: { userId } });
    if (!existingProfile) throw new NotFoundError('Profile', userId);

    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can update profiles for other users');
      }
    }

    const profile = await prisma.profile.update({
      where: { userId },
      data,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || userId,
        action: 'UPDATE',
        resourceType: 'PROFILE',
        resourceId: profile.id,
        oldValues: { preferredLanguage: existingProfile.preferredLanguage, timezone: existingProfile.timezone },
        newValues: { preferredLanguage: profile.preferredLanguage, timezone: profile.timezone },
        status: 'SUCCESS',
      },
    });

    return { profile };
  }

  static async deleteProfile(userId: string, actingUserId: string): Promise<void> {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundError('Profile', userId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can delete profiles');
    }

    await prisma.profile.delete({ where: { userId } });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'DELETE',
        resourceType: 'PROFILE',
        resourceId: profile.id,
        oldValues: { preferredLanguage: profile.preferredLanguage, timezone: profile.timezone },
        status: 'SUCCESS',
      },
    });
  }
}
