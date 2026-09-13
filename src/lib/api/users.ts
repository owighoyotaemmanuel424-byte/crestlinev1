// src/lib/api/users.ts
// User/Profile API client

import { apiClient } from './client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  avatar?: string;
}

export interface ProfileUpdateData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
}

export interface PasswordUpdateData {
  currentPassword: string;
  newPassword: string;
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

class UsersApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendPaginatedResponse<T>,
    fieldName: string
  ): { [key: string]: T[] } & { total: number; page: number; limit: number; totalPages: number } {
    return {
      [fieldName]: backendResponse.data,
      total: backendResponse.meta.total,
      page: backendResponse.meta.page,
      limit: backendResponse.meta.limit,
      totalPages: backendResponse.meta.totalPages,
    };
  }

  async getProfile(): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<User>>('/api/profile', token);
    return backendResponse.data;
  }

  async updateProfile(data: ProfileUpdateData): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<User>>('/api/profile', data, token);
    return backendResponse.data;
  }

  async updatePassword(data: PasswordUpdateData): Promise<{ message: string }> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<{ message: string }>>('/api/profile/password', data, token);
    return backendResponse.data;
  }

  // Admin methods
  async getAllUsers(params: { page?: number; limit?: number; search?: string; role?: string; status?: string } = {}): Promise<{ users: User[]; total: number; page: number; limit: number; totalPages: number }> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.role) queryParams.append('role', params.role);
    if (params.status) queryParams.append('status', params.status);
    
    const endpoint = `/api/admin/users?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<User>>(endpoint, token);
    return this.transformPaginatedResponse<User>(backendResponse, 'users') as { users: User[]; total: number; page: number; limit: number; totalPages: number };
  }

  async getUserById(id: string): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<User>>(`/api/admin/users/${id}`, token);
    return backendResponse.data;
  }

  async updateUser(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: string; role?: string }): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<User>>(`/api/admin/users/${id}`, data, token);
    return backendResponse.data;
  }

  async freezeUser(id: string): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<User>>(`/api/admin/users/${id}/freeze`, {}, token);
    return backendResponse.data;
  }

  async unfreezeUser(id: string): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<User>>(`/api/admin/users/${id}/unfreeze`, {}, token);
    return backendResponse.data;
  }
}

const usersApi = new UsersApi();

export { usersApi };