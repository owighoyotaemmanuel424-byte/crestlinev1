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

class BeneficiariesApi {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || null;
    }
    return null;
  }

  async getMyBeneficiaries(params: BeneficiaryListParams = {}): Promise<BeneficiaryListResult> {
    const token = this.getToken();
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.isVerified !== undefined) queryParams.append('isVerified', params.isVerified.toString());
    
    const endpoint = `/api/beneficiaries?${queryParams.toString()}`;
    return apiClient.get<BeneficiaryListResult>(endpoint, token);
  }

  async getBeneficiaryById(id: string): Promise<Beneficiary> {
    const token = this.getToken();
    return apiClient.get<Beneficiary>(`/api/beneficiaries/${id}`, token);
  }

  async createBeneficiary(data: CreateBeneficiaryData): Promise<Beneficiary> {
    const token = this.getToken();
    return apiClient.post<Beneficiary>('/api/beneficiaries', data, token);
  }

  async updateBeneficiary(id: string, data: UpdateBeneficiaryData): Promise<Beneficiary> {
    const token = this.getToken();
    return apiClient.patch<Beneficiary>(`/api/beneficiaries/${id}`, data, token);
  }

  async deleteBeneficiary(id: string): Promise<{ message: string }> {
    const token = this.getToken();
    return apiClient.delete<{ message: string }>(`/api/beneficiaries/${id}`, token);
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
    return apiClient.get<BeneficiaryListResult>(endpoint, token);
  }

  async verifyBeneficiary(id: string): Promise<Beneficiary> {
    const token = this.getToken();
    return apiClient.patch<Beneficiary>(`/api/admin/beneficiaries/${id}/verify`, {}, token);
  }

  async rejectBeneficiary(id: string, reason?: string): Promise<Beneficiary> {
    const token = this.getToken();
    return apiClient.patch<Beneficiary>(`/api/admin/beneficiaries/${id}/reject`, { reason }, token);
  }
}

const beneficiariesApi = new BeneficiariesApi();

export { beneficiariesApi };