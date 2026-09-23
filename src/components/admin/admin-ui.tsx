'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Shared presentation primitives for the privileged console.
 *
 * The console is deliberately dark and purple-accented so an operator can never
 * mistake a privileged surface for the customer app, which is why it does not
 * reuse the light-themed marketing components.
 */

const TONE_CLASSES = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  danger: 'border-red-400/30 bg-red-500/10 text-red-300',
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  neutral: 'border-white/12 bg-white/[0.05] text-slate-300',
} as const;

export type AdminTone = keyof typeof TONE_CLASSES;

const STATUS_TONES: Record<string, AdminTone> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  RESOLVED: 'success',
  VERIFIED: 'success',
  LOW: 'success',
  PENDING: 'warning',
  PROCESSING: 'warning',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'warning',
  HOLD: 'warning',
  ON_HOLD: 'warning',
  DRAFT: 'warning',
  MEDIUM: 'warning',
  REQUESTED_CHANGES: 'info',
  OPEN: 'info',
  REVIEW: 'info',
  HIGH: 'danger',
  CRITICAL: 'danger',
  FAILED: 'danger',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  FROZEN: 'danger',
  CLOSED: 'danger',
  CANCELLED: 'danger',
  ESCALATED: 'danger',
};

export function toneForValue(value?: string | null): AdminTone {
  if (!value) return 'neutral';
  return STATUS_TONES[value.toUpperCase()] ?? 'neutral';
}

export function StatusPill({
  value,
  tone,
  className,
}: {
  value?: string | null;
  tone?: AdminTone;
  className?: string;
}) {
  if (!value) {
    return <span className="text-xs text-slate-600">—</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide',
        TONE_CLASSES[tone ?? toneForValue(value)],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function AdminCard({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'privileged';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-[#161e2e]',
        tone === 'privileged'
          ? 'border-purple-500/25 bg-purple-500/[0.06]'
          : 'border-white/10',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ConsoleBadge({
  label = 'Admin',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-purple-400/35 bg-purple-500/12 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-purple-200',
        className
      )}
    >
      {children ?? label}
    </span>
  );
}
