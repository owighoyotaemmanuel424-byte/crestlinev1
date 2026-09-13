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

class NotificationsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
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
    return apiClient.get<NotificationListResult>(endpoint, token);
  }

  async getNotificationById(id: string): Promise<Notification> {
    const token = this.getToken();
    return apiClient.get<Notification>(`/api/notifications/${id}`, token);
  }

  async markAsRead(id: string): Promise<Notification> {
    const token = this.getToken();
    return apiClient.patch<Notification>(`/api/notifications/${id}/read`, {}, token);
  }

  async markAllAsRead(): Promise<{ count: number }> {
    const token = this.getToken();
    return apiClient.patch<{ count: number }>('/api/notifications/read-all', {}, token);
  }

  async deleteNotification(id: string): Promise<{ message: string }> {
    const token = this.getToken();
    return apiClient.delete<{ message: string }>(`/api/notifications/${id}`, token);
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
    return apiClient.get<NotificationListResult>(endpoint, token);
  }

  async createNotification(data: { userId: string; title: string; message: string; type: string; category: string; metadata?: Record<string, any> }): Promise<Notification> {
    const token = this.getToken();
    return apiClient.post<Notification>('/api/admin/notifications', data, token);
  }
}

const notificationsApi = new NotificationsApi();

export { notificationsApi };