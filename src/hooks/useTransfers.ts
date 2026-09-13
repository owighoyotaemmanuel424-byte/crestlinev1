// src/hooks/useTransfers.ts
// Hook for managing transfers data

import { useState, useEffect, useCallback } from 'react';
import { transfersApi, Transfer, TransferListParams, TransferListResult, CreateTransferData } from '@/lib/api';

export interface UseTransfersState {
  transfers: Transfer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseTransfersReturn extends UseTransfersState {
  refetch: (params?: TransferListParams) => Promise<void>;
  createTransfer: (data: CreateTransferData) => Promise<Transfer>;
  cancelTransfer: (id: string) => Promise<Transfer>;
}

export function useTransfers(initialParams?: TransferListParams): UseTransfersReturn {
  const [state, setState] = useState<UseTransfersState>({
    transfers: [],
    total: 0,
    page: initialParams?.page || 1,
    limit: initialParams?.limit || 10,
    totalPages: 0,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async (params?: TransferListParams) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const fetchParams: TransferListParams = {
        page: params?.page || state.page,
        limit: params?.limit || state.limit,
        search: params?.search,
        status: params?.status,
        type: params?.type,
        accountId: params?.accountId,
        startDate: params?.startDate,
        endDate: params?.endDate,
      };

      const result = await transfersApi.getMyTransfers(fetchParams);
      
      setState({
        transfers: result.transfers,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch transfers';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [state.page, state.limit]);

  const createTransfer = useCallback(async (data: CreateTransferData): Promise<Transfer> => {
    try {
      const transfer = await transfersApi.createTransfer(data);
      await refetch();
      return transfer;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to create transfer';
      throw new Error(message);
    }
  }, [refetch]);

  const cancelTransfer = useCallback(async (id: string): Promise<Transfer> => {
    try {
      const transfer = await transfersApi.cancelTransfer(id);
      await refetch();
      return transfer;
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to cancel transfer';
      throw new Error(message);
    }
  }, [refetch]);

  useEffect(() => {
    refetch(initialParams);
  }, [refetch, initialParams]);

  return {
    ...state,
    refetch,
    createTransfer,
    cancelTransfer,
  };
}

export default useTransfers;