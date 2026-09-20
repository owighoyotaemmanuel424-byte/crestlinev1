'use client';

import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { HTMLAttributes, forwardRef, type Ref } from 'react';

import { cn } from '@/lib/utils';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  showIcon?: boolean;
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'border-border bg-muted/60 text-foreground',
  destructive: 'border-destructive/25 bg-destructive/[0.06] text-destructive',
  success: 'border-success/25 bg-success/[0.07] text-success',
  warning: 'border-warning/30 bg-warning/[0.08] text-warning',
  info: 'border-primary/25 bg-accent text-accent-foreground',
};

const VARIANT_ICONS: Record<string, LucideIcon> = {
  default: Info,
  destructive: AlertCircle,
  success: CheckCircle2,
  warning: TriangleAlert,
  info: Info,
};

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', showIcon = true, children, ...props }, ref) => {
    const Icon = VARIANT_ICONS[variant];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'flex items-start gap-3 rounded-lg border p-4 text-sm',
          VARIANT_STYLES[variant],
          className
        )}
        {...props}
      >
        {showIcon && Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }
);
Alert.displayName = 'Alert';

const AlertTitle = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref as Ref<HTMLHeadingElement>}
    className={cn('mb-1 font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
