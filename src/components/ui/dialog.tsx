'use client';

import { Fragment, ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

export function Dialog({
  isOpen,
  open,
  onClose,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
}: DialogProps) {
  const visible = open ?? isOpen ?? false;

  const close = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-4xl',
  };

  return (
    <Fragment>
      <div
        className="fixed inset-0 z-50 animate-fade-in bg-navy-950/55 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        aria-describedby={description ? 'dialog-description' : undefined}
      >
        <div
          className={cn(
            'w-full animate-fade-up overflow-hidden rounded-t-2xl border border-border bg-card shadow-elevated sm:rounded-xl',
            sizeClasses[size]
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              {title && (
                <h2 id="dialog-title" className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id="dialog-description" className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="iconSm"
                onClick={close}
                className="-mr-1.5 -mt-1 text-muted-foreground"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/50 px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
}

export interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 border-t border-border bg-muted/50 px-6 py-4',
        className
      )}
    >
      {children}
    </div>
  );
}
