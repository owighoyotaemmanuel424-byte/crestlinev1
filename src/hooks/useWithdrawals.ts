// src/hooks/useWithdrawals.ts
// Hook for managing withdrawals data

import { useState, useEffect, useCallback } from 'react';
import { withdrawalsApi, Withdrawal, WithdrawalListParams, WithdrawalListResult, CreateWithdrawalData } from '@/lib/api';

export interface UseWithdrawalsState {
  withdrawals: Withdrawal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseWithdrawalsReturn extends UseWithdrawalsState {
  refetch: (params?: WithdrawalListParams) => Promise<void>;
  createWithdrawal: (data: CreateWithdrawalData) => Promise<Withdrawal>;
  cancelWithdrawal: (id: string) => Promise<Withdrawal>;
}

export function useWithdrawals(initialParams?: WithdrawalListParams): UseWithdrawalsReturn {
  const [state, setState] = useState<UseWithdrawalsState>({
    withdrawals: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: WithdrawalListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: WithdrawalListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        search: params?.search,
        status: params?.status,
        method: params?.method,
        accountId: params?.accountId,
        startDate: params?.startDate,
        endDate: params?.endDate,
      };

      const result = await withdrawalsApi.getMyWithdrawals(fetchParams);
      
      setState({
        withdrawals: result.withdrawals,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch withdrawals';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  const createWithdrawal = useCallback(async (data: CreateWithdrawalData): Promise<Withdrawal> => {
    try {
      const withdrawal = await withdrawalsApi.createWithdrawal(data);
      await refetch();
      return withdrawal;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to create withdrawal';
      throw new Error(message);
    }
  }, [refetch]);

  const cancelWithdrawal = useCallback(async (id: string): Promise<Withdrawal> => {
    try {
      const withdrawal = await withdrawalsApi.cancelWithdrawal(id);
      await refetch();
      return withdrawal;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to cancel withdrawal';
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
    createWithdrawal,
    cancelWithdrawal,
  };
}

export default useWithdrawals;