'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  FileLock2,
  RefreshCw,
  ScanFace,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { AdminCard, ConsoleBadge } from '@/components/admin/admin-ui';
import { ConsoleShell } from '@/components/admin/console-shell';
import { Button } from '@/components/ui/button';
import { useConsoleSession } from '@/hooks/use-console-session';
import { ADMIN_RESOURCES } from '@/lib/admin/resources';
import { cn } from '@/lib/utils';

const MODULE_STYLES: Record<string, { icon: LucideIcon; tone: string }> = {
  customers: { icon: Users, tone: 'border-sky-400/25 bg-sky-500/10 text-sky-300' },
  kyc: { icon: ScanFace, tone: 'border-purple-400/25 bg-purple-500/10 text-purple-300' },
  deposits: { icon: Banknote, tone: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' },
  withdrawals: { icon: Wallet, tone: 'border-amber-400/25 bg-amber-500/10 text-amber-300' },
  transfers: { icon: ArrowLeftRight, tone: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300' },
  transactions: { icon: FileLock2, tone: 'border-indigo-400/25 bg-indigo-500/10 text-indigo-300' },
  loans: { icon: CreditCard, tone: 'border-rose-400/25 bg-rose-500/10 text-rose-300' },
  fraud: { icon: Activity, tone: 'border-red-400/25 bg-red-500/10 text-red-300' },
};

/** Pull a record count out of the various admin list response shapes. */
function readTotal(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, any>;

  if (typeof body.meta?.total === 'number') return body.meta.total;
  if (typeof body.total === 'number') return body.total;

  const data = body.data ?? body;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    if (typeof data.total === 'number') return data.total;
    const stats = data.stats;
    if (stats && typeof stats === 'object') {
      const value = Object.values(stats).find((entry) => typeof entry === 'number');
      if (typeof value === 'number') return value;
    }
  }
  return null;
}

export default function AdminConsolePage() {
  const { operator, displayName, token, isReady, signOut } = useConsoleSession();
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const loadCounts = useCallback(async (bearer: string) => {
    setIsRefreshing(true);
    const entries = await Promise.all(
      ADMIN_RESOURCES.map(async (resource) => {
        try {
          const separator = resource.endpoint.includes('?') ? '&' : '?';
          const response = await fetch(`${resource.endpoint}${separator}limit=1`, {
            headers: { Authorization: 'Bearer ' + bearer },
          });
          if (!response.ok) return [resource.slug, null] as const;
          const payload = await response.json();
          return [resource.slug, readTotal(payload)] as const;
        } catch {
          return [resource.slug, null] as const;
        }
      })
    );

    setCounts(Object.fromEntries(entries));
    setLastLoadedAt(new Date());
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    if (token) loadCounts(token);
  }, [token, loadCounts]);

  if (!isReady || !operator || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19] text-sm text-slate-400">
        Verifying console session…
      </div>
    );
  }

  return (
    <ConsoleShell operator={operator} displayName={displayName} onSignOut={signOut}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ConsoleBadge label="Privileged workspace" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Operations console
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Live operational queues across servicing, compliance and payments. Open any module to
            work the queue; counts come straight from the admin APIs and refresh on demand.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastLoadedAt && (
            <span className="text-xs text-slate-500">
              Updated {lastLoadedAt.toLocaleTimeString()}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadCounts(token)}
            isLoading={isRefreshing}
            className="border-white/15 bg-white/[0.04] text-slate-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ADMIN_RESOURCES.map((resource) => {
          const style = MODULE_STYLES[resource.slug] ?? {
            icon: FileLock2,
            tone: 'border-white/12 bg-white/[0.05] text-slate-300',
          };
          const Icon = style.icon;
          const pending = resource.actions?.length ?? 0;

          return (
            <Link
              key={resource.slug}
              href={`/admin/${resource.slug}`}
              className="group rounded-xl border border-white/10 bg-[#161e2e] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-400/30"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-300">{resource.label}</p>
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border',
                    style.tone
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-white">
                {resource.slug in counts
                  ? counts[resource.slug] === null
                    ? '—'
                    : counts[resource.slug]
                  : '···'}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{resource.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-300 transition-colors group-hover:text-purple-200">
                Open queue
                <ArrowUpRight className="h-3.5 w-3.5" />
                {pending > 0 && <span className="text-slate-500">· {pending} actions</span>}
              </span>
            </Link>
          );
        })}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <AdminCard className="p-6">
          <h2 className="text-base font-semibold text-white">Your session</h2>
          <dl className="mt-5 space-y-3.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3.5">
              <dt className="text-slate-400">Operator</dt>
              <dd className="font-medium text-slate-100">{displayName}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3.5">
              <dt className="text-slate-400">Email</dt>
              <dd className="font-medium text-slate-100">{operator.email}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3.5">
              <dt className="text-slate-400">Role</dt>
              <dd>
                <ConsoleBadge label={operator.role.replace(/_/g, ' ')} />
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-slate-400">Session policy</dt>
              <dd className="font-medium text-slate-100">7 day bearer token</dd>
            </div>
          </dl>
        </AdminCard>

        <AdminCard tone="privileged" className="p-6">
          <h2 className="text-base font-semibold text-white">Privileged actions are audited</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Every console request is written to the audit trail with the acting operator id, target
            resource and outcome. Fraud, KYC and payment queues are enforced server-side by role, so
            a customer session can never call them.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-md border border-white/15 bg-white/[0.04] px-3.5 text-[0.8125rem] font-semibold text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
            >
              Customer dashboard
            </Link>
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-md border border-white/15 bg-white/[0.04] px-3.5 text-[0.8125rem] font-semibold text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
            >
              Public site
            </Link>
          </div>
        </AdminCard>
      </section>
    </ConsoleShell>
  );
}
