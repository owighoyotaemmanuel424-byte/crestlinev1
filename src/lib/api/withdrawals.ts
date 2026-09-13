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

class WithdrawalsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
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
    return apiClient.get<WithdrawalListResult>(endpoint, token);
  }

  async getWithdrawalById(id: string): Promise<Withdrawal> {
    const token = this.getToken();
    return apiClient.get<Withdrawal>(`/api/withdrawals/${id}`, token);
  }

  async createWithdrawal(data: CreateWithdrawalData): Promise<Withdrawal> {
    const token = this.getToken();
    return apiClient.post<Withdrawal>('/api/withdrawals', data, token);
  }

  async cancelWithdrawal(id: string): Promise<Withdrawal> {
    const token = this.getToken();
    return apiClient.patch<Withdrawal>(`/api/withdrawals/${id}/cancel`, {}, token);
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
    return apiClient.get<WithdrawalListResult>(endpoint, token);
  }
}

const withdrawalsApi = new WithdrawalsApi();

export { withdrawalsApi };