'use client';

// src/components/ui/toast.tsx
// Toast notification component

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert, X } from 'lucide-react';

import { cn } from '@/lib/utils';

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

const TOAST_STYLES: Record<ToastType, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: 'border-success/25 bg-success/[0.07]',
    icon: <CheckCircle2 className="h-5 w-5 text-success" />,
  },
  error: {
    wrapper: 'border-destructive/25 bg-destructive/[0.06]',
    icon: <AlertCircle className="h-5 w-5 text-destructive" />,
  },
  warning: {
    wrapper: 'border-warning/30 bg-warning/[0.08]',
    icon: <TriangleAlert className="h-5 w-5 text-warning" />,
  },
  info: {
    wrapper: 'border-primary/25 bg-accent',
    icon: <Info className="h-5 w-5 text-primary" />,
  },
  loading: {
    wrapper: 'border-border bg-muted',
    icon: <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />,
  },
};

const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onRemove,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);

    if (type !== 'loading') {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onRemove(id), 250);
      }, duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [id, type, duration, onRemove]);

  const style = TOAST_STYLES[type];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'pointer-events-auto mb-3 flex items-start gap-3 rounded-xl border bg-card p-4 shadow-elevated transition-all duration-250',
        style.wrapper,
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
      )}
    >
      <div className="mt-0.5 shrink-0">{style.icon}</div>
      <div className="min-w-0 flex-1">
        {title && (
          <p className="text-sm font-semibold text-foreground">{title}</p>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
      {type !== 'loading' && (
        <button
          type="button"
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onRemove(id), 250);
          }}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
  position = 'top-right',
}) => {
  const positions: Record<string, string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className={cn(
        'pointer-events-none fixed z-[60] w-[min(22rem,calc(100vw-2rem))]',
        positions[position]
      )}
      role="region"
      aria-label="Notifications"
    >
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

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = 'top-right',
}) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (message: string, title?: string, duration?: number) =>
      addToast({ type: 'success', message, title, duration }),
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string, duration?: number) =>
      addToast({ type: 'error', message, title, duration }),
    [addToast]
  );

  const warning = useCallback(
    (message: string, title?: string, duration?: number) =>
      addToast({ type: 'warning', message, title, duration }),
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string, duration?: number) =>
      addToast({ type: 'info', message, title, duration }),
    [addToast]
  );

  const loading = useCallback(
    (message: string, title?: string) =>
      addToast({ type: 'loading', message, title, duration: 0 }),
    [addToast]
  );

  const dismiss = useCallback((id: string) => removeToast(id), [removeToast]);

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

export type { ToastMessage, ToastType };
