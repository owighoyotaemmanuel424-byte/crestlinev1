// src/lib/api/users.ts
// User/Profile API client

import { apiClient, BackendResponse, BackendSuccessResponse } from './client';

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

class UsersApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { users: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      users: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
    };
  }

  async getProfile(): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<User>('/api/profile', token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<User>).data;
  }

  async updateProfile(data: ProfileUpdateData): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<User>('/api/profile', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<User>).data;
  }

  async updatePassword(data: PasswordUpdateData): Promise<{ message: string }> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<{ message: string }>('/api/profile/password', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<{ message: string }>).data;
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
    const backendResponse = await apiClient.get<User[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<User>(backendResponse as BackendSuccessResponse<User[]>);
  }

  async getUserById(id: string): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<User>(`/api/admin/users/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<User>).data;
  }

  async updateUser(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: string; role?: string }): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<User>(`/api/admin/users/${id}`, data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<User>).data;
  }

  async freezeUser(id: string): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<User>(`/api/admin/users/${id}/freeze`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<User>).data;
  }

  async unfreezeUser(id: string): Promise<User> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<User>(`/api/admin/users/${id}/unfreeze`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<User>).data;
  }
}

const usersApi = new UsersApi();

export { usersApi };