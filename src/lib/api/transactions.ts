// src/lib/api/transactions.ts
// Transaction API client

import { apiClient } from './client';

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

class TransactionsApi {
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
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Transaction>>(endpoint, token);
    return this.transformPaginatedResponse<Transaction>(backendResponse, 'transactions') as TransactionListResult;
  }

  async getTransactionById(id: string): Promise<Transaction> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Transaction>>(`/api/transactions/${id}`, token);
    return backendResponse.data;
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
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Transaction>>(endpoint, token);
    return this.transformPaginatedResponse<Transaction>(backendResponse, 'transactions') as TransactionListResult;
  }
}

const transactionsApi = new TransactionsApi();

export { transactionsApi };