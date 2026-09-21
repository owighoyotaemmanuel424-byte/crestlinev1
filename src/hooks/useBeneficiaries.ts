// src/hooks/useBeneficiaries.ts
// Hook for managing beneficiaries data

import { useState, useEffect, useCallback } from 'react';
import { beneficiariesApi, Beneficiary, BeneficiaryListParams, BeneficiaryListResult } from '@/lib/api';

export interface UseBeneficiariesState {
  beneficiaries: Beneficiary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseBeneficiariesReturn extends UseBeneficiariesState {
  refetch: (params?: BeneficiaryListParams) => Promise<void>;
}

export function useBeneficiaries(initialParams?: BeneficiaryListParams): UseBeneficiariesReturn {
  const [state, setState] = useState<UseBeneficiariesState>({
    beneficiaries: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: BeneficiaryListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: BeneficiaryListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        search: params?.search,
        isVerified: params?.isVerified,
      };

      const result = await beneficiariesApi.getMyBeneficiaries(fetchParams);
      
      setState({
        beneficiaries: result.beneficiaries,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch beneficiaries';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  // Keyed on the serialised params so a fresh object literal from the caller
  // does not trigger an endless refetch loop.
  const paramsKey = JSON.stringify(initialParams ?? {});

  // Initial fetch
  useEffect(() => {
    refetch(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return {
    ...state,
    refetch,
  };
}

export interface UseBeneficiaryState {
  beneficiary: Beneficiary | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseBeneficiaryReturn extends UseBeneficiaryState {
  refetch: () => Promise<void>;
}

export function useBeneficiary(id: string): UseBeneficiaryReturn {
  const [state, setState] = useState<UseBeneficiaryState>({
    beneficiary: null,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const beneficiary = await beneficiariesApi.getBeneficiaryById(id);
      setState({
        beneficiary,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch beneficiary';
      setState({
        beneficiary: null,
        isLoading: false,
        error: message,
      });
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      refetch();
    }
  }, [id, refetch]);

  return {
    ...state,
    refetch,
  };
}

export default useBeneficiaries;