// src/lib/api/accounts.ts
// Account API client

import { apiClient } from './client';

// Types matching Prisma models
export interface Account {
  id: string;
  accountNumber: string;
  userId: string;
  name: string;
  accountType: string;
  currency: string;
  balance: number;
  availableBalance: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  transactions?: any[];
}

export interface AccountListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  accountType?: string;
}

export interface AccountListResult {
  accounts: Account[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateAccountData {
  name: string;
  accountType: string;
  currency?: string;
  initialDeposit?: number;
}

export interface UpdateAccountData {
  name?: string;
  status?: string;
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

class AccountsApi {
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

  async getMyAccounts(params: AccountListParams = {}): Promise<AccountListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.accountType) queryParams.append('accountType', params.accountType);
    
    const endpoint = '/api/accounts?' + queryParams.toString();
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Account>>(endpoint, token);
    return this.transformPaginatedResponse<Account>(backendResponse, 'accounts') as AccountListResult;
  }

  async getAccountById(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Account>>('/api/accounts/' + id, token);
    return backendResponse.data;
  }

  async createAccount(data: CreateAccountData): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<BackendSuccessResponse<Account>>('/api/accounts', data, token);
    return backendResponse.data;
  }

  async updateAccount(id: string, data: UpdateAccountData): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Account>>('/api/accounts/' + id, data, token);
    return backendResponse.data;
  }

  async freezeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Account>>('/api/accounts/' + id + '/freeze', {}, token);
    return backendResponse.data;
  }

  async unfreezeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Account>>('/api/accounts/' + id + '/unfreeze', {}, token);
    return backendResponse.data;
  }

  async closeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Account>>('/api/accounts/' + id + '/close', {}, token);
    return backendResponse.data;
  }

  async getAccountBalance(id: string): Promise<{ balance: number; availableBalance: number }> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<{ balance: number; availableBalance: number }>>('/api/accounts/' + id + '/balance', token);
    return backendResponse.data;
  }

  async getAccountStatement(id: string, startDate?: string, endDate?: string): Promise<any> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('startDate', startDate);
    if (endDate) queryParams.append('endDate', endDate);
    const endpoint = '/api/accounts/' + id + '/statement?' + queryParams.toString();
    const backendResponse = await apiClient.get<BackendSuccessResponse<any>>(endpoint, token);
    return backendResponse.data;
  }

  // Admin methods
  async getAllAccounts(params: AccountListParams & { userId?: string } = {}): Promise<AccountListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.accountType) queryParams.append('accountType', params.accountType);
    if (params.userId) queryParams.append('userId', params.userId);
    
    const endpoint = '/api/admin/accounts?' + queryParams.toString();
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Account>>(endpoint, token);
    return this.transformPaginatedResponse<Account>(backendResponse, 'accounts') as AccountListResult;
  }
}

const accountsApi = new AccountsApi();

export { accountsApi };