// src/hooks/useNotifications.ts
// Hook for managing notifications data

import { useState, useEffect, useCallback } from 'react';
import { notificationsApi, Notification, NotificationListParams, NotificationListResult } from '@/lib/api';

export interface UseNotificationsState {
  notifications: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseNotificationsReturn extends UseNotificationsState {
  refetch: (params?: NotificationListParams) => Promise<void>;
  markAsRead: (id: string) => Promise<Notification>;
  markAllAsRead: () => Promise<{ count: number }>;
  deleteNotification: (id: string) => Promise<void>;
}

export function useNotifications(initialParams?: NotificationListParams): UseNotificationsReturn {
  const [state, setState] = useState<UseNotificationsState>({
    notifications: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    unreadCount: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: NotificationListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: NotificationListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        isRead: params?.isRead,
        type: params?.type,
        category: params?.category,
      };

      const result = await notificationsApi.getMyNotifications(fetchParams);
      
      setState({
        notifications: result.notifications,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        unreadCount: result.unreadCount,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch notifications';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  const markAsRead = useCallback(async (id: string): Promise<Notification> => {
    try {
      const notification = await notificationsApi.markAsRead(id);
      await refetch();
      return notification;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to mark notification as read';
      throw new Error(message);
    }
  }, [refetch]);

  const markAllAsRead = useCallback(async (): Promise<{ count: number }> => {
    try {
      const result = await notificationsApi.markAllAsRead();
      await refetch();
      return result;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to mark all notifications as read';
      throw new Error(message);
    }
  }, [refetch]);

  const deleteNotification = useCallback(async (id: string): Promise<void> => {
    try {
      await notificationsApi.deleteNotification(id);
      await refetch();
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to delete notification';
      throw new Error(message);
    }
  }, [refetch]);

  useEffect(() => {
    refetch(initialParams);
  }, [refetch, initialParams]);

  return {
    ...state,
    refetch,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}

export default useNotifications;