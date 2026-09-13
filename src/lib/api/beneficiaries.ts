// src/lib/api/beneficiaries.ts
// Beneficiary API client

import { apiClient } from './client';

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

class BeneficiariesApi {
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

  async getMyBeneficiaries(params: BeneficiaryListParams = {}): Promise<BeneficiaryListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.isVerified !== undefined) queryParams.append('isVerified', params.isVerified.toString());
    
    const endpoint = `/api/beneficiaries?${queryParams.toString()}`;
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Beneficiary>>(endpoint, token);
    return this.transformPaginatedResponse<Beneficiary>(backendResponse, 'beneficiaries') as BeneficiaryListResult;
  }

  async getBeneficiaryById(id: string): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.get<BackendSuccessResponse<Beneficiary>>(`/api/beneficiaries/${id}`, token);
    return backendResponse.data;
  }

  async createBeneficiary(data: CreateBeneficiaryData): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.post<BackendSuccessResponse<Beneficiary>>('/api/beneficiaries', data, token);
    return backendResponse.data;
  }

  async updateBeneficiary(id: string, data: UpdateBeneficiaryData): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Beneficiary>>(`/api/beneficiaries/${id}`, data, token);
    return backendResponse.data;
  }

  async deleteBeneficiary(id: string): Promise<{ message: string }> {
    const token = this.getToken();
    const backendResponse = await apiClient.delete<BackendSuccessResponse<{ message: string }>>(`/api/beneficiaries/${id}`, token);
    return backendResponse.data;
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
    const backendResponse = await apiClient.get<BackendPaginatedResponse<Beneficiary>>(endpoint, token);
    return this.transformPaginatedResponse<Beneficiary>(backendResponse, 'beneficiaries') as BeneficiaryListResult;
  }

  async verifyBeneficiary(id: string): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Beneficiary>>(`/api/admin/beneficiaries/${id}/verify`, {}, token);
    return backendResponse.data;
  }

  async rejectBeneficiary(id: string, reason?: string): Promise<Beneficiary> {
    const token = this.getToken();
    const backendResponse = await apiClient.patch<BackendSuccessResponse<Beneficiary>>(`/api/admin/beneficiaries/${id}/reject`, { reason }, token);
    return backendResponse.data;
  }
}

const beneficiariesApi = new BeneficiariesApi();

export { beneficiariesApi };