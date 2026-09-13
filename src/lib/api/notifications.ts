// src/lib/api/notifications.ts
// Notification API client

import { apiClient } from './client';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  category: string;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  readAt?: Date;
}

export interface NotificationListParams {
  page?: number;
  limit?: number;
  isRead?: boolean;
  type?: string;
  category?: string;
}

export interface NotificationListResult {
  notifications: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount: number;
}

// Backend response types
interface BackendPaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface BackendSuccessResponse<T> {
  success: boolean;
  data: T;
}

class NotificationsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendPaginatedResponse<T>,
    fieldName: string
  ): { [key: string]: T[] } & { total: number; page: number; limit: number; totalPages: number; unreadCount?: number } {
    const base = {
      [fieldName]: backendResponse.data,
      total: backendResponse.meta.total,
      page: backendResponse.meta.page,
      limit: backendResponse.meta.limit,
      totalPages: backendResponse.meta.totalPages,
    };
    // Add unreadCount if present in response
    return base as any;
  }

  async getMyNotifications(params: NotificationListParams = {}): Promise<NotificationListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.isRead !== undefined) queryParams.append('isRead', params.isRead.toString());
    if (params.type) queryParams.append('type', params.type);
    if (params.category) queryParams.append('category', params.category);
    
    const endpoint = `/api/notifications?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Notification>>(endpoint, token);
    const result = this.transformPaginatedResponse<Notification>(backendResponse, 'notifications') as NotificationListResult;
    // TODO: unreadCount needs to be fetched separately or included in backend response
    return { ...result, unreadCount: 0 };
  }

  async getNotificationById(id: string): Promise<Notification> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Notification>>(`/api/notifications/${id}`, token);
    return backendResponse.data;
  }

  async markAsRead(id: string): Promise<Notification> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Notification>>(`/api/notifications/${id}/read`, {}, token);
    return backendResponse.data;
  }

  async markAllAsRead(): Promise<{ count: number }> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<{ count: number }>>('/api/notifications/read-all', {}, token);
    return backendResponse.data;
  }

  async deleteNotification(id: string): Promise<{ message: string }> {
    const token = this.getToken();
    const backendResponse = await apiClient.delete<BackendSuccessResponse<{ message: string }>>(`/api/notifications/${id}`, token);
    return backendResponse.data;
  }

  // Admin methods
  async getAllNotifications(params: NotificationListParams & { userId?: string } = {}): Promise<NotificationListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.isRead !== undefined) queryParams.append('isRead', params.isRead.toString());
    if (params.type) queryParams.append('type', params.type);
    if (params.category) queryParams.append('category', params.category);
    if (params.userId) queryParams.append('userId', params.userId);
    
    const endpoint = `/api/admin/notifications?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Notification>>(endpoint, token);
    const result = this.transformPaginatedResponse<Notification>(backendResponse, 'notifications') as NotificationListResult;
    return { ...result, unreadCount: 0 };
  }

  async createNotification(data: { userId: string; title: string; message: string; type: string; category: string; metadata?: Record<string, any> }): Promise<Notification> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<BackendSuccessResponse<Notification>>('/api/admin/notifications', data, token);
    return backendResponse.data;
  }
}

const notificationsApi = new NotificationsApi();

export { notificationsApi };