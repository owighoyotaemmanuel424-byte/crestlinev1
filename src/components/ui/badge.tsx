'use client';

import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'neutral'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'outline'
    | 'error'
    | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-secondary text-secondary-foreground ring-1 ring-inset ring-border',
  neutral: 'bg-secondary text-secondary-foreground ring-1 ring-inset ring-border',
  secondary: 'bg-secondary text-secondary-foreground ring-1 ring-inset ring-border',
  primary: 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary/25',
  info: 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary/25',
  success: 'bg-success/10 text-success ring-1 ring-inset ring-success/25',
  warning: 'bg-warning/10 text-warning ring-1 ring-inset ring-warning/25',
  destructive: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/25',
  error: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/25',
  outline: 'border border-border text-muted-foreground',
};

const SIZE_STYLES: Record<string, string> = {
  sm: 'px-2 py-0.5 text-[0.6875rem]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1 text-sm',
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold capitalize tracking-wide',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
);
Badge.displayName = 'Badge';

export { Badge };
