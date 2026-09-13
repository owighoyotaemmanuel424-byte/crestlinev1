// src/hooks/useAccounts.ts
// Hook for managing accounts data

import { useState, useEffect, useCallback } from 'react';
import { accountsApi, Account, AccountListParams, AccountListResult } from '@/lib/api';

export interface UseAccountsState {
  accounts: Account[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseAccountsReturn extends UseAccountsState {
  refetch: (params?: AccountListParams) => Promise<void>;
}

export function useAccounts(initialParams?: AccountListParams): UseAccountsReturn {
  const [state, setState] = useState<UseAccountsState>({
    accounts: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: AccountListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: AccountListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        search: params?.search,
        status: params?.status,
        accountType: params?.accountType,
      };

      const result = await accountsApi.getMyAccounts(fetchParams);
      
      setState({
        accounts: result.accounts,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch accounts';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  // Initial fetch
  useEffect(() => {
    refetch(initialParams);
  }, [refetch, initialParams]);

  return {
    ...state,
    refetch,
  };
}

export interface UseAccountState {
  account: Account | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseAccountReturn extends UseAccountState {
  refetch: () => Promise<void>;
}

export function useAccount(id: string): UseAccountReturn {
  const [state, setState] = useState<UseAccountState>({
    account: null,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const account = await accountsApi.getAccountById(id);
      setState({
        account,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch account';
      setState({
        account: null,
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

export default useAccounts;