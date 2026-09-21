// src/hooks/useTransactions.ts
// Hook for managing transactions data

import { useState, useEffect, useCallback } from 'react';
import { transactionsApi, Transaction, TransactionListParams, TransactionListResult } from '@/lib/api';

export interface UseTransactionsState {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseTransactionsReturn extends UseTransactionsState {
  refetch: (params?: TransactionListParams) => Promise<void>;
}

export function useTransactions(initialParams?: TransactionListParams): UseTransactionsReturn {
  const [state, setState] = useState<UseTransactionsState>({
    transactions: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: TransactionListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: TransactionListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        search: params?.search,
        type: params?.type,
        status: params?.status,
        accountId: params?.accountId,
        startDate: params?.startDate,
        endDate: params?.endDate,
        minAmount: params?.minAmount,
        maxAmount: params?.maxAmount,
      };

      const result = await transactionsApi.getMyTransactions(fetchParams);
      
      setState({
        transactions: result.transactions,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch transactions';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  const paramsKey = JSON.stringify(initialParams ?? {});

  useEffect(() => {
    refetch(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return {
    ...state,
    refetch,
  };
}

export interface UseTransactionState {
  transaction: Transaction | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseTransactionReturn extends UseTransactionState {
  refetch: () => Promise<void>;
}

export function useTransaction(id: string): UseTransactionReturn {
  const [state, setState] = useState<UseTransactionState>({
    transaction: null,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const transaction = await transactionsApi.getTransactionById(id);
      setState({
        transaction,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch transaction';
      setState({
        transaction: null,
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

export default useTransactions;