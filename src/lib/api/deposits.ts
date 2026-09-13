// src/lib/api/deposits.ts
// Deposit API client

import { apiClient } from './client';

export interface Deposit {
  id: string;
  reference: string;
  accountId: string;
  amount: number;
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
  amount: number;
  currency?: string;
  method: string;
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

class DepositsApi {
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
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Deposit>>(endpoint, token);
    return this.transformPaginatedResponse<Deposit>(backendResponse, 'deposits') as DepositListResult;
  }

  async getDepositById(id: string): Promise<Deposit> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Deposit>>(`/api/deposits/${id}`, token);
    return backendResponse.data;
  }

  async createDeposit(data: CreateDepositData): Promise<Deposit> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<BackendSuccessResponse<Deposit>>('/api/deposits', data, token);
    return backendResponse.data;
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
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Deposit>>(endpoint, token);
    return this.transformPaginatedResponse<Deposit>(backendResponse, 'deposits') as DepositListResult;
  }
}

const depositsApi = new DepositsApi();

export { depositsApi };