'use client';

// src/components/ui/toast.tsx
// Toast notification component

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  onDismiss?: () => void;
}

interface ToastProps extends ToastMessage {
  onRemove: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ id, type, title, message, duration = 5000, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    
    // Auto-dismiss for non-loading toasts
    if (type !== 'loading') {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onRemove(id), 300);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, type, duration, onRemove]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onRemove(id), 300);
  };

  const getToastStyles = () => {
    const baseStyles = 'p-4 rounded-lg shadow-lg mb-4 transition-all duration-300 transform';
    const visibilityStyles = isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full';
    
    const typeStyles = {
      success: 'bg-green-50 border border-green-200 text-green-800',
      error: 'bg-red-50 border border-red-200 text-red-800',
      warning: 'bg-yellow-50 border border-yellow-200 text-yellow-800',
      info: 'bg-blue-50 border border-blue-200 text-blue-800',
      loading: 'bg-gray-50 border border-gray-200 text-gray-800',
    };

    return `${baseStyles} ${visibilityStyles} ${typeStyles[type]}`;
  };

  const getIcon = () => {
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
      loading: '⋯',
    };
    return icons[type];
  };

  return (
    <div className={getToastStyles()} role="alert" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="text-xl" aria-hidden="true">
          {getIcon()}
        </div>
        <div className="flex-1">
          {title && <div className="font-semibold mb-1">{title}</div>}
          <div className="text-sm">{message}</div>
        </div>
        {type !== 'loading' && (
          <button
            onClick={handleDismiss}
            className="text-lg hover:opacity-70 transition-opacity"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove, position = 'top-right' }) => {
  const getContainerStyles = () => {
    const base = 'fixed z-50 max-w-sm w-full p-4';
    const positions = {
      'top-left': 'top-4 left-4',
      'top-right': 'top-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'bottom-right': 'bottom-4 right-4',
    };
    return `${base} ${positions[position]}`;
  };

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={getContainerStyles()} role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  );
};

// Toast context and provider

interface ToastContextType {
  addToast: (toast: Omit<ToastMessage, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (message: string, title?: string, duration?: number) => string;
  error: (message: string, title?: string, duration?: number) => string;
  warning: (message: string, title?: string, duration?: number) => string;
  info: (message: string, title?: string, duration?: number) => string;
  loading: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children, position = 'top-right' }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((message: string, title?: string, duration?: number) => {
    return addToast({ type: 'success', message, title, duration });
  }, [addToast]);

  const error = useCallback((message: string, title?: string, duration?: number) => {
    return addToast({ type: 'error', message, title, duration });
  }, [addToast]);

  const warning = useCallback((message: string, title?: string, duration?: number) => {
    return addToast({ type: 'warning', message, title, duration });
  }, [addToast]);

  const info = useCallback((message: string, title?: string, duration?: number) => {
    return addToast({ type: 'info', message, title, duration });
  }, [addToast]);

  const loading = useCallback((message: string, title?: string) => {
    return addToast({ type: 'loading', message, title, duration: 0 }); // No auto-dismiss for loading
  }, [addToast]);

  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, [removeToast]);

  const value: ToastContextType = {
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
    loading,
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} position={position} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
