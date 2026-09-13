// src/lib/api/beneficiaries.ts
// Beneficiary API client

import { apiClient, BackendResponse, BackendSuccessResponse } from './client';

export interface Beneficiary {
  id: string;
  userId: string;
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode?: string;
  branch?: string;
  currency: string;
  type: string;
  isVerified: boolean;
  verificationStatus?: string;
  verificationReference?: string;
  verifiedAt?: Date;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BeneficiaryListParams {
  page?: number;
  limit?: number;
  search?: string;
  isVerified?: boolean;
}

export interface BeneficiaryListResult {
  beneficiaries: Beneficiary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateBeneficiaryData {
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode?: string;
  branch?: string;
  currency?: string;
  type?: string;
  notes?: string;
}

export interface UpdateBeneficiaryData {
  name?: string;
  accountNumber?: string;
  bankName?: string;
  bankCode?: string;
  branch?: string;
  currency?: string;
  notes?: string;
}

class BeneficiariesApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  private transformPaginatedResponse<T>(
    backendResponse: BackendSuccessResponse<T[]>
  ): { beneficiaries: T[]; total: number; page: number; limit: number; totalPages: number } {
    return {
      beneficiaries: backendResponse.data,
      total: backendResponse.meta?.total || 0,
      page: backendResponse.meta?.page || 1,
      limit: backendResponse.meta?.limit || 20,
      totalPages: backendResponse.meta?.totalPages || 1,
    };
  }

  async getMyBeneficiaries(params: BeneficiaryListParams = {}): Promise<BeneficiaryListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.isVerified !== undefined) queryParams.append('isVerified', params.isVerified.toString());
    
    const endpoint = `/api/beneficiaries?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<Beneficiary[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Beneficiary>(backendResponse as BackendSuccessResponse<Beneficiary[]>);
  }

  async getBeneficiaryById(id: string): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<Beneficiary>(`/api/beneficiaries/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Beneficiary>).data;
  }

  async createBeneficiary(data: CreateBeneficiaryData): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<Beneficiary>('/api/beneficiaries', data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Beneficiary>).data;
  }

  async updateBeneficiary(id: string, data: UpdateBeneficiaryData): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Beneficiary>(`/api/beneficiaries/${id}`, data, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Beneficiary>).data;
  }

  async deleteBeneficiary(id: string): Promise<{ message: string }> {
    const token = this.getToken();
    const backendResponse = await apiClient.delete<{ message: string }>(`/api/beneficiaries/${id}`, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<{ message: string }>).data;
  }

  // Admin methods
  async getAllBeneficiaries(params: BeneficiaryListParams & { userId?: string } = {}): Promise<BeneficiaryListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.isVerified !== undefined) queryParams.append('isVerified', params.isVerified.toString());
    if (params.userId) queryParams.append('userId', params.userId);
    
    const endpoint = `/api/admin/beneficiaries?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<Beneficiary[]>(endpoint, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return this.transformPaginatedResponse<Beneficiary>(backendResponse as BackendSuccessResponse<Beneficiary[]>);
  }

  async verifyBeneficiary(id: string): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Beneficiary>(`/api/admin/beneficiaries/${id}/verify`, {}, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Beneficiary>).data;
  }

  async rejectBeneficiary(id: string, reason?: string): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<Beneficiary>(`/api/admin/beneficiaries/${id}/reject`, { reason }, token);
    if (!backendResponse.success) {
      throw backendResponse;
    }
    return (backendResponse as BackendSuccessResponse<Beneficiary>).data;
  }
}

const beneficiariesApi = new BeneficiariesApi();

export { beneficiariesApi };