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

class TransfersApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
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
    return apiClient.get<TransferListResult>(endpoint, token);
  }

  async getTransferById(id: string): Promise<Transfer> {
    const token = this.getToken();
    return apiClient.get<Transfer>(`/api/transfers/${id}`, token);
  }

  async createTransfer(data: CreateTransferData): Promise<Transfer> {
    const token = this.getToken();
    return apiClient.post<Transfer>('/api/transfers', data, token);
  }

  async cancelTransfer(id: string): Promise<Transfer> {
    const token = this.getToken();
    return apiClient.patch<Transfer>(`/api/transfers/${id}/cancel`, {}, token);
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
    return apiClient.get<TransferListResult>(endpoint, token);
  }

  async approveTransfer(id: string): Promise<Transfer> {
    const token = this.getToken();
    return apiClient.patch<Transfer>(`/api/admin/transfers/${id}/approve`, {}, token);
  }

  async rejectTransfer(id: string, reason?: string): Promise<Transfer> {
    const token = this.getToken();
    return apiClient.patch<Transfer>(`/api/admin/transfers/${id}/reject`, { reason }, token);
  }
}

const transfersApi = new TransfersApi();

export { transfersApi };