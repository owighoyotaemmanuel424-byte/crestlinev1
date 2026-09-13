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

class UsersApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  async getProfile(): Promise<User> {
    const token = this.getToken();
    return apiClient.get<User>('/api/profile', token);
  }

  async updateProfile(data: ProfileUpdateData): Promise<User> {
    const token = this.getToken();
    return apiClient.patch<User>('/api/profile', data, token);
  }

  async updatePassword(data: PasswordUpdateData): Promise<{ message: string }> {
    const token = this.getToken();
    return apiClient.patch<{ message: string }>('/api/profile/password', data, token);
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
    return apiClient.get<{ users: User[]; total: number; page: number; limit: number; totalPages: number }>(endpoint, token);
  }

  async getUserById(id: string): Promise<User> {
    const token = this.getToken();
    return apiClient.get<User>(`/api/admin/users/${id}`, token);
  }

  async updateUser(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: string; role?: string }): Promise<User> {
    const token = this.getToken();
    return apiClient.patch<User>(`/api/admin/users/${id}`, data, token);
  }

  async freezeUser(id: string): Promise<User> {
    const token = this.getToken();
    return apiClient.patch<User>(`/api/admin/users/${id}/freeze`, {}, token);
  }

  async unfreezeUser(id: string): Promise<User> {
    const token = this.getToken();
    return apiClient.patch<User>(`/api/admin/users/${id}/unfreeze`, {}, token);
  }
}

const usersApi = new UsersApi();

export { usersApi };