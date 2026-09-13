import { apiClient, BackendResponse, BackendSuccessResponse } from './client';
import { Decimal } from '@prisma/client/runtime/library';

export interface Deposit {
  id: string;
  reference: string;
  accountId: string;
  amount: Decimal;
  currency: string;
  method: string;
  status: string;
  description: string;
  journalId: string;
  userId: string;
  transactionId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
  account?: any;
  journal?: any;
}

export interface DepositListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  method?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

export interface DepositListResult {
  deposits: Deposit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateDepositData {
  accountId: string;
  amount: Decimal;
  currency?: string;
  method: string;
  description?: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

class DepositsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { deposits: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      deposits: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
    };
  }

  async getMyDeposits(params: DepositListParams = {}): Promise<DepositListResult> {
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
    
    const endpoint = `/api/deposits?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<Deposit[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Deposit>(backendResponse as BackendSuccessResponse<Deposit[]>);
  }

  async getDepositById(id: string): Promise<Deposit> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Deposit>(`/api/deposits/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Deposit>).data;
  }

  async createDeposit(data: CreateDepositData): Promise<Deposit> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<Deposit>('/api/deposits', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Deposit>).data;
  }

  // Admin methods
  async getAllDeposits(params: DepositListParams & { userId?: string } = {}): Promise<DepositListResult> {
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
    
    const endpoint = `/api/admin/deposits?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<Deposit[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Deposit>(backendResponse as BackendSuccessResponse<Deposit[]>);
  }
}

const depositsApi = new DepositsApi();

export { depositsApi };