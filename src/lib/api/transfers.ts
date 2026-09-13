// src/lib/api/transfers.ts
// Transfer API client

import { apiClient } from './client';

export interface Transfer {
  id: string;
  reference: string;
  senderAccountId: string;
  recipientAccountId: string;
  recipientName?: string;
  recipientBank?: string;
  recipientAccountNumber?: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  type: string;
  fee?: number;
  totalAmount?: number;
  journalId: string;
  userId: string;
  createdAt: Date;
  completedAt?: Date;
  scheduledFor?: Date;
  riskStatus?: string;
  riskScore?: number;
  notes?: string;
  senderAccount?: any;
  recipientAccount?: any;
  journal?: any;
}

export interface TransferListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

export interface TransferListResult {
  transfers: Transfer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateTransferData {
  senderAccountId: string;
  recipientAccountId?: string;
  recipientName?: string;
  recipientBank?: string;
  recipientAccountNumber?: string;
  amount: number;
  currency?: string;
  description?: string;
  scheduledFor?: string;
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

class TransfersApi {
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

  async getMyTransfers(params: TransferListParams = {}): Promise<TransferListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.type) queryParams.append('type', params.type);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    
    const endpoint = `/api/transfers?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Transfer>>(endpoint, token);
    return this.transformPaginatedResponse<Transfer>(backendResponse, 'transfers') as TransferListResult;
  }

  async getTransferById(id: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Transfer>>(`/api/transfers/${id}`, token);
    return backendResponse.data;
  }

  async createTransfer(data: CreateTransferData): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<BackendSuccessResponse<Transfer>>('/api/transfers', data, token);
    return backendResponse.data;
  }

  async cancelTransfer(id: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Transfer>>(`/api/transfers/${id}/cancel`, {}, token);
    return backendResponse.data;
  }

  // Admin methods
  async getAllTransfers(params: TransferListParams & { userId?: string } = {}): Promise<TransferListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.type) queryParams.append('type', params.type);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    
    const endpoint = `/api/admin/transfers?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Transfer>>(endpoint, token);
    return this.transformPaginatedResponse<Transfer>(backendResponse, 'transfers') as TransferListResult;
  }

  async approveTransfer(id: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Transfer>>(`/api/admin/transfers/${id}/approve`, {}, token);
    return backendResponse.data;
  }

  async rejectTransfer(id: string, reason?: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Transfer>>(`/api/admin/transfers/${id}/reject`, { reason }, token);
    return backendResponse.data;
  }
}

const transfersApi = new TransfersApi();

export { transfersApi };