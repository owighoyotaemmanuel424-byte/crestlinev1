'use client';

import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant = 'default', size = 'md', dot = false, children, ...props }, ref) => {
  const variants = {
    default: 'bg-secondary text-secondary-foreground',
    primary: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    destructive: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    outline: 'border border-gray-200 dark:border-gray-700',
  };
  const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-0.5 text-sm', lg: 'px-3 py-1 text-sm' };
  return <span ref={ref} className={cn('inline-flex items-center font-medium rounded-full', variants[variant], sizes[size], className)} {...props}>{dot && <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />}{children}</span>;
});
Badge.displayName = 'Badge';
export { Badge };
