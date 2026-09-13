// src/hooks/useTransaction.ts
// Hook for managing single transaction data

import { useState, useEffect, useCallback } from 'react';
import { transactionsApi, Transaction } from '@/lib/api';

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

export default useTransaction;