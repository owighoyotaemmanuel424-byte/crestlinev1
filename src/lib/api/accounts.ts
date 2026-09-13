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

class AccountsApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
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
    return apiClient.get<AccountListResult>(endpoint, token);
  }

  async getAccountById(id: string): Promise<Account> {
    const token = this.getToken();
    return apiClient.get<Account>('/api/accounts/' + id, token);
  }

  async createAccount(data: CreateAccountData): Promise<Account> {
    const token = this.getToken();
    return apiClient.post<Account>('/api/accounts', data, token);
  }

  async updateAccount(id: string, data: UpdateAccountData): Promise<Account> {
    const token = this.getToken();
    return apiClient.patch<Account>('/api/accounts/' + id, data, token);
  }

  async freezeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    return apiClient.patch<Account>('/api/accounts/' + id + '/freeze', {}, token);
  }

  async unfreezeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    return apiClient.patch<Account>('/api/accounts/' + id + '/unfreeze', {}, token);
  }

  async closeAccount(id: string): Promise<Account> {
    const token = this.getToken();
    return apiClient.patch<Account>('/api/accounts/' + id + '/close', {}, token);
  }

  async getAccountBalance(id: string): Promise<{ balance: number; availableBalance: number }> {
    const token = this.getToken();
    return apiClient.get<{ balance: number; availableBalance: number }>('/api/accounts/' + id + '/balance', token);
  }

  async getAccountStatement(id: string, startDate?: string, endDate?: string): Promise<any> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('startDate', startDate);
    if (endDate) queryParams.append('endDate', endDate);
    const endpoint = '/api/accounts/' + id + '/statement?' + queryParams.toString();
    return apiClient.get<any>(endpoint, token);
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
    return apiClient.get<AccountListResult>(endpoint, token);
  }
}

const accountsApi = new AccountsApi();

export { accountsApi };