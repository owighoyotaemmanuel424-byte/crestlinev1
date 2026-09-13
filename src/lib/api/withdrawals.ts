import { apiClient, BackendResponse, BackendSuccessResponse } from './client';
import { Decimal } from '@prisma/client/runtime/library';

export interface Withdrawal {
  id: string;
  reference: string;
  accountId: string;
  amount: Decimal;
  currency: string;
  method: string;
  destination: string;
  status: string;
  description: string;
  journalId: string;
  userId: string;
  transactionId?: string;
  fee?: Decimal;
  totalAmount?: Decimal;
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
  amount: Decimal;
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

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { withdrawals: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      withdrawals: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
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
    const backendResponse = await apiClient.get<Withdrawal[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Withdrawal>(backendResponse as BackendSuccessResponse<Withdrawal[]>);
  }

  async getWithdrawalById(id: string): Promise<Withdrawal> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Withdrawal>(`/api/withdrawals/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Withdrawal>).data;
  }

  async createWithdrawal(data: CreateWithdrawalData): Promise<Withdrawal> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<Withdrawal>('/api/withdrawals', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Withdrawal>).data;
  }

  async cancelWithdrawal(id: string): Promise<Withdrawal> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Withdrawal>(`/api/withdrawals/${id}/cancel`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Withdrawal>).data;
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
    const backendResponse = await apiClient.get<Withdrawal[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Withdrawal>(backendResponse as BackendSuccessResponse<Withdrawal[]>);
  }
}

const withdrawalsApi = new WithdrawalsApi();

export { withdrawalsApi };