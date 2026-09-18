'use client';

import { useCallback, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = String(++toastId);
    setToasts((prev) => [...prev, { id, type, message, title }]);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
    
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((message: string, title?: string) => {
    return addToast('success', message, title);
  }, [addToast]);

  const error = useCallback((message: string, title?: string) => {
    return addToast('error', message, title);
  }, [addToast]);

  const warning = useCallback((message: string, title?: string) => {
    return addToast('warning', message, title);
  }, [addToast]);

  const info = useCallback((message: string, title?: string) => {
    return addToast('info', message, title);
  }, [addToast]);

  return {
    toasts,
    addToast,
    dismissToast,
    success,
    error,
    warning,
    info,
  };
}

export type UseToastReturn = ReturnType<typeof useToast>;
