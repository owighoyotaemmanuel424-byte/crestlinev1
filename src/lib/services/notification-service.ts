import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import type { Notification, NotificationType, NotificationCategory, User } from '@prisma/client';

export interface CreateNotificationData {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  category?: NotificationCategory;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  notification: Notification & { user?: Partial<User> };
}

export class NotificationService {
  static async createNotification(data: CreateNotificationData, actingUserId?: string): Promise<NotificationResult> {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        category: data.category || 'SYSTEM',
        metadata: data.metadata,
        isRead: false,
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'NOTIFICATION',
        resourceId: notification.id,
        newValues: { title: data.title, message: data.message, type: data.type, category: data.category },
        status: 'SUCCESS',
      },
    });

    return { notification };
  }

  static async getNotificationById(id: string, userId?: string): Promise<NotificationResult> {
    const notification = await prisma.notification.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    if (!notification) {
      throw new NotFoundError('Notification', id);
    }

    if (userId && notification.userId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this notification');
      }
    }

    return { notification };
  }

  static async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    isRead?: boolean,
    type?: NotificationType,
    category?: NotificationCategory,
    actingUserId?: string
  ) {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these notifications');
      }
    }

    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    if (type) where.type = type;
    if (category) where.category = category;

    const notifications = await prisma.notification.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    const total = await prisma.notification.count({ where });
    const unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });

    return {
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  static async markNotificationAsRead(id: string, userId: string): Promise<NotificationResult> {
    const notification = await prisma.notification.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!notification) {
      throw new NotFoundError('Notification', id);
    }

    if (notification.userId !== userId) {
      throw new ForbiddenError('You do not own this notification');
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'READ',
        resourceType: 'NOTIFICATION',
        resourceId: notification.id,
        oldValues: { isRead: notification.isRead },
        newValues: { isRead: true },
        status: 'SUCCESS',
      },
    });

    return { notification: updatedNotification };
  }

  static async markAllNotificationsAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'READ_ALL',
        resourceType: 'NOTIFICATION',
        resourceId: userId,
        status: 'SUCCESS',
      },
    });
  }

  static async deleteNotification(id: string, userId: string): Promise<void> {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundError('Notification', id);
    }

    if (notification.userId !== userId) {
      throw new ForbiddenError('You do not own this notification');
    }

    await prisma.notification.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'DELETE',
        resourceType: 'NOTIFICATION',
        resourceId: notification.id,
        oldValues: { title: notification.title, message: notification.message },
        status: 'SUCCESS',
      },
    });
  }

  static async getNotificationStats(userId: string) {
    const [total, unread, info, warning, error, success] = await Promise.all([
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.count({ where: { userId, type: 'INFO' as NotificationType } }),
      prisma.notification.count({ where: { userId, type: 'WARNING' as NotificationType } }),
      prisma.notification.count({ where: { userId, type: 'ERROR' as NotificationType } }),
      prisma.notification.count({ where: { userId, type: 'SUCCESS' as NotificationType } }),
    ]);

    return { total, unread, info, warning, error, success };
  }
}
