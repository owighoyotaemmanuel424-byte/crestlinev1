import { type LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: 'up' | 'down' };
  tone?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
}) {
  const toneStyles: Record<string, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-accent text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };

  const TrendIcon = trend?.direction === 'down' ? TrendingDown : TrendingUp;

  return (
    <div className={cn('chase-card chase-card-hover p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              toneStyles[tone]
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold',
              trend.direction === 'up' ? 'text-success' : 'text-destructive'
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" />
            {trend.value}
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
