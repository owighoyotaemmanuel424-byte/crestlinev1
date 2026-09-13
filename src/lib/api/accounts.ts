// src/lib/api/accounts.ts
// Account API client

import { apiClient, BackendResponse, BackendSuccessResponse } from './client';

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

class AccountsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { accounts: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      accounts: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
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
    const backendResponse = await apiClient.get<Account[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Account>(backendResponse as BackendSuccessResponse<Account[]>);
  }

  async getAccountById(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Account>('/api/accounts/' + id, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Account>).data;
  }

  async createAccount(data: CreateAccountData): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<Account>('/api/accounts', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Account>).data;
  }

  async updateAccount(id: string, data: UpdateAccountData): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Account>('/api/accounts/' + id, data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Account>).data;
  }

  async freezeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Account>('/api/accounts/' + id + '/freeze', {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Account>).data;
  }

  async unfreezeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Account>('/api/accounts/' + id + '/unfreeze', {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Account>).data;
  }

  async closeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Account>('/api/accounts/' + id + '/close', {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Account>).data;
  }

  async getAccountBalance(id: string): Promise<{ balance: number; availableBalance: number }> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<{ balance: number; availableBalance: number }>('/api/accounts/' + id + '/balance', token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<{ balance: number; availableBalance: number }>).data;
  }

  async getAccountStatement(id: string, startDate?: string, endDate?: string): Promise<any> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('startDate', startDate);
    if (endDate) queryParams.append('endDate', endDate);
    const endpoint = '/api/accounts/' + id + '/statement?' + queryParams.toString();
    const backendResponse = await apiClient.get<any>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<any>).data;
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
    const backendResponse = await apiClient.get<Account[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Account>(backendResponse as BackendSuccessResponse<Account[]>);
  }
}

const accountsApi = new AccountsApi();

export { accountsApi };
