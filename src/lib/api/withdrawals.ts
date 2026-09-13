// src/lib/api/withdrawals.ts
// Withdrawal API client

import { apiClient } from './client';

export interface Withdrawal {
  id: string;
  reference: string;
  accountId: string;
  amount: number;
  currency: string;
  method: string;
  destination: string;
  status: string;
  description: string;
  journalId: string;
  userId: string;
  transactionId?: string;
  fee?: number;
  totalAmount?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
  account?: any;
  journal?: any;
}

export interface WithdrawalListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  method?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

export interface WithdrawalListResult {
  withdrawals: Withdrawal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateWithdrawalData {
  accountId: string;
  amount: number;
  currency?: string;
  method: string;
  destination: string;
  description?: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
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

class WithdrawalsApi {
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

  async getMyWithdrawals(params: WithdrawalListParams = {}): Promise<WithdrawalListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.method) queryParams.append('method', params.method);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    
    const endpoint = `/api/withdrawals?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Withdrawal>>(endpoint, token);
    return this.transformPaginatedResponse<Withdrawal>(backendResponse, 'withdrawals') as WithdrawalListResult;
  }

  async getWithdrawalById(id: string): Promise<Withdrawal> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Withdrawal>>(`/api/withdrawals/${id}`, token);
    return backendResponse.data;
  }

  async createWithdrawal(data: CreateWithdrawalData): Promise<Withdrawal> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<BackendSuccessResponse<Withdrawal>>('/api/withdrawals', data, token);
    return backendResponse.data;
  }

  async cancelWithdrawal(id: string): Promise<Withdrawal> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Withdrawal>>(`/api/withdrawals/${id}/cancel`, {}, token);
    return backendResponse.data;
  }

  // Admin methods
  async getAllWithdrawals(params: WithdrawalListParams & { userId?: string } = {}): Promise<WithdrawalListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.method) queryParams.append('method', params.method);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    
    const endpoint = `/api/admin/withdrawals?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Withdrawal>>(endpoint, token);
    return this.transformPaginatedResponse<Withdrawal>(backendResponse, 'withdrawals') as WithdrawalListResult;
  }
}

const withdrawalsApi = new WithdrawalsApi();

export { withdrawalsApi };