// src/hooks/useDeposits.ts
// Hook for managing deposits data

import { useState, useEffect, useCallback } from 'react';
import { depositsApi, Deposit, DepositListParams, DepositListResult, CreateDepositData } from '@/lib/api';

export interface UseDepositsState {
  deposits: Deposit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseDepositsReturn extends UseDepositsState {
  refetch: (params?: DepositListParams) => Promise<void>;
  createDeposit: (data: CreateDepositData) => Promise<Deposit>;
}

export function useDeposits(initialParams?: DepositListParams): UseDepositsReturn {
  const [state, setState] = useState<UseDepositsState>({
    deposits: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: DepositListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: DepositListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        search: params?.search,
        status: params?.status,
        method: params?.method,
        accountId: params?.accountId,
        startDate: params?.startDate,
        endDate: params?.endDate,
      };

      const result = await depositsApi.getMyDeposits(fetchParams);
      
      setState({
        deposits: result.deposits,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch deposits';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  const createDeposit = useCallback(async (data: CreateDepositData): Promise<Deposit> => {
    try {
      const deposit = await depositsApi.createDeposit(data);
      await refetch();
      return deposit;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to create deposit';
      throw new Error(message);
    }
  }, [refetch]);

  const paramsKey = JSON.stringify(initialParams ?? {});

  useEffect(() => {
    refetch(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return {
    ...state,
    refetch,
    createDeposit,
  };
}

export default useDeposits;