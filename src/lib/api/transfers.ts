import { apiClient, BackendResponse, BackendSuccessResponse } from './client';
import { Decimal } from '@prisma/client/runtime/library';

export interface Transfer {
  id: string;
  reference: string;
  senderAccountId: string;
  recipientAccountId: string;
  recipientName?: string;
  recipientBank?: string;
  recipientAccountNumber?: string;
  amount: Decimal;
  currency: string;
  description: string;
  status: string;
  type: string;
  fee?: Decimal;
  totalAmount?: Decimal;
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

class TransfersApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { transfers: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      transfers: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
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
    const backendResponse = await apiClient.get<Transfer[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Transfer>(backendResponse as BackendSuccessResponse<Transfer[]>);
  }

  async getTransferById(id: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Transfer>(`/api/transfers/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Transfer>).data;
  }

  async createTransfer(data: any): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<Transfer>('/api/transfers', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Transfer>).data;
  }

  async cancelTransfer(id: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Transfer>(`/api/transfers/${id}/cancel`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Transfer>).data;
  }

  // Admin methods
  async getAllTransfers(params: any = {}): Promise<TransferListResult> {
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
    const backendResponse = await apiClient.get<Transfer[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Transfer>(backendResponse as BackendSuccessResponse<Transfer[]>);
  }

  async approveTransfer(id: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Transfer>(`/api/admin/transfers/${id}/approve`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Transfer>).data;
  }

  async rejectTransfer(id: string, reason?: string): Promise<Transfer> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Transfer>(`/api/admin/transfers/${id}/reject`, { reason }, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Transfer>).data;
  }
}

const transfersApi = new TransfersApi();

export { transfersApi };