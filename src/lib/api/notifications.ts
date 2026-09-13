// src/lib/api/notifications.ts
// Notification API client

import { apiClient, BackendResponse, BackendSuccessResponse } from './client';

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

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { notifications: T[]; total: number; page: number; limit: number; totalPages: number; unreadCount: number } {
    return {
      notifications: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
      unreadCount: 0, // TODO: Fetch unread count separately or include in backend response
    };
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
    const backendResponse = await apiClient.get<Notification[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Notification>(backendResponse as BackendSuccessResponse<Notification[]>);
  }

  async getNotificationById(id: string): Promise<Notification> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Notification>(`/api/notifications/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Notification>).data;
  }

  async markAsRead(id: string): Promise<Notification> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Notification>(`/api/notifications/${id}/read`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Notification>).data;
  }

  async markAllAsRead(): Promise<{ count: number }> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<{ count: number }>('/api/notifications/read-all', {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<{ count: number }>).data;
  }

  async deleteNotification(id: string): Promise<{ message: string }> {
    const token = this.getToken();
    const backendResponse = await apiClient.delete<{ message: string }>(`/api/notifications/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<{ message: string }>).data;
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
    const backendResponse = await apiClient.get<Notification[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Notification>(backendResponse as BackendSuccessResponse<Notification[]>);
  }

  async createNotification(data: { userId: string; title: string; message: string; type: string; category: string; metadata?: Record<string, any> }): Promise<Notification> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<Notification>('/api/admin/notifications', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Notification>).data;
  }
}

const notificationsApi = new NotificationsApi();

export { notificationsApi };