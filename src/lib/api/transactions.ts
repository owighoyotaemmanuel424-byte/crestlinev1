// src/lib/api/transactions.ts
// Transaction API client

import { apiClient, BackendResponse, BackendSuccessResponse } from './client';

export interface Transaction {
  id: string;
  reference: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  accountId: string;
  userId: string;
  journalId: string;
  createdAt: Date;
  completedAt?: Date;
  fees?: any[];
  journal?: any;
  account?: any;
}

export interface TransactionListParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  status?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface TransactionListResult {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class TransactionsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { transactions: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      transactions: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
    };
  }

  async getMyTransactions(params: TransactionListParams = {}): Promise<TransactionListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.type) queryParams.append('type', params.type);
    if (params.status) queryParams.append('status', params.status);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.minAmount) queryParams.append('minAmount', params.minAmount.toString());
    if (params.maxAmount) queryParams.append('maxAmount', params.maxAmount.toString());
    
    const endpoint = `/api/transactions?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<Transaction[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Transaction>(backendResponse as BackendSuccessResponse<Transaction[]>);
  }

  async getTransactionById(id: string): Promise<Transaction> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Transaction>(`/api/transactions/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Transaction>).data;
  }

  // Admin methods
  async getAllTransactions(params: TransactionListParams & { userId?: string } = {}): Promise<TransactionListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.type) queryParams.append('type', params.type);
    if (params.status) queryParams.append('status', params.status);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.minAmount) queryParams.append('minAmount', params.minAmount.toString());
    if (params.maxAmount) queryParams.append('maxAmount', params.maxAmount.toString());
    
    const endpoint = `/api/admin/transactions?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<Transaction[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Transaction>(backendResponse as BackendSuccessResponse<Transaction[]>);
  }
}

const transactionsApi = new TransactionsApi();

export { transactionsApi };