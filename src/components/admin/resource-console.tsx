'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AdminCard, StatusPill, type AdminTone } from '@/components/admin/admin-ui';
import type { AdminAction, AdminColumn, AdminResource } from '@/lib/admin/resources';
import { cn, formatCurrency, formatDateTime, toAmount } from '@/lib/utils';

type Row = Record<string, any>;

const PAGE_SIZE = 20;

function readPath(row: Row, path?: string): unknown {
  if (!path) return undefined;
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc && typeof acc === 'object' ? (acc as Row)[key] : undefined),
      row
    );
}

/** Every admin list endpoint is slightly different; normalise them all. */
function pickRows(payload: any, listKey?: string): Row[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (listKey) {
    if (Array.isArray(payload?.[listKey])) return payload[listKey];
    if (Array.isArray(payload?.data?.[listKey])) return payload.data[listKey];
  }
  return [];
}

function pickMeta(payload: any, fallbackCount: number) {
  const meta = payload?.meta ?? payload?.data?.meta ?? {};
  const total = Number(meta.total ?? payload?.total ?? fallbackCount) || 0;
  const totalPages =
    Number(meta.totalPages ?? payload?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE))) || 1;
  return { total, totalPages };
}

function cell(row: Row, column: AdminColumn) {
  const value = readPath(row, column.path);

  switch (column.kind) {
    case 'reference':
      return (
        <span className="font-mono text-[0.78rem] text-slate-300">
          {String(row.reference ?? row.id ?? '—')}
        </span>
      );
    case 'person': {
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '—';
      return (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-100">{name}</p>
          <p className="truncate text-xs text-slate-500">{String(row.email ?? '')}</p>
        </div>
      );
    }
    case 'user': {
      const user = (value ?? row.user) as Row | undefined;
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
      return (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-100">{name || user?.email || '—'}</p>
          <p className="truncate text-xs text-slate-500">
            {name ? String(user?.email ?? '') : String(row.userId ?? '')}
          </p>
        </div>
      );
    }
    case 'transfer': {
      const from = row.fromUser as Row | undefined;
      const to = row.toUser as Row | undefined;
      return (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-100">
            {String(from?.email ?? row.fromUserId ?? '—')}
          </p>
          <p className="truncate text-xs text-slate-500">→ {String(to?.email ?? row.toUserId ?? '')}</p>
        </div>
      );
    }
    case 'amount':
      return (
        <span className="font-mono text-[0.8125rem] font-medium text-slate-100">
          {formatCurrency(toAmount(value as never), String(row.currency ?? 'USD'))}
        </span>
      );
    case 'date':
      return (
        <span className="whitespace-nowrap text-xs text-slate-400">
          {value ? formatDateTime(value as Date | string) : '—'}
        </span>
      );
    case 'status':
      return <StatusPill value={value ? String(value) : null} />;
    case 'role': {
      const role = value ? String(value) : '';
      const tone: AdminTone = ['ADMIN', 'SUPER_ADMIN'].includes(role)
        ? 'danger'
        : role
          ? 'info'
          : 'neutral';
      return <StatusPill value={role || null} tone={tone} />;
    }
    case 'risk':
      return <StatusPill value={value ? String(value) : null} />;
    default:
      return (
        <span className={cn('text-slate-300', column.mono && 'font-mono text-[0.78rem]')}>
          {value === null || value === undefined || value === '' ? '—' : String(value)}
        </span>
      );
  }
}

function actionToneClass(tone: AdminAction['tone']) {
  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-300 hover:border-red-400/50 hover:bg-red-500/15';
  }
  if (tone === 'primary') {
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/15';
  }
  return 'border-white/15 bg-white/[0.05] text-slate-200 hover:border-white/25 hover:bg-white/10';
}

/**
 * A single operations queue: filters the list endpoint, renders it as a table
 * and posts privileged actions with the operator's bearer token.
 */
export function ResourceConsole({ resource, token }: { resource: AdminResource; token: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );
  const [pending, setPending] = useState<{ action: AdminAction; row: Row } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (debouncedSearch && resource.searchParam) {
        params.set(resource.searchParam, debouncedSearch);
      }

      const response = await fetch(`${resource.endpoint}?${params.toString()}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Could not load this queue');
      }

      const nextRows = pickRows(payload, resource.listKey);
      setRows(nextRows);
      setMeta(pickMeta(payload, nextRows.length));
    } catch (error) {
      setRows([]);
      setMeta({ total: 0, totalPages: 1 });
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not load this queue',
      });
    } finally {
      setIsLoading(false);
    }
  }, [resource.endpoint, resource.listKey, resource.searchParam, page, status, debouncedSearch, token]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Any filter change restarts from the first page.
  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

  const openAction = (action: AdminAction, row: Row) => {
    setPending({ action, row });
    setValues({});
  };

  const submitAction = async () => {
    if (!pending) return;
    const { action, row } = pending;

    const missing = (action.fields ?? []).find(
      (field) => field.required && !values[field.name]?.trim()
    );
    if (missing) {
      setFeedback({ tone: 'error', message: `${missing.label} is required.` });
      return;
    }

    const body: Record<string, unknown> = {};
    for (const field of action.fields ?? []) {
      const raw = values[field.name]?.trim();
      if (!raw) continue;
      body[field.name] = field.type === 'number' ? Number(raw) : raw;
    }

    setIsSubmitting(true);
    try {
      const rowId = String(row.id ?? row.reference ?? '');
      const response = await fetch(action.path.replace(':id', rowId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `${action.label} failed`);
      }

      setFeedback({
        tone: 'success',
        message: `${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)} marked ${action.label.toLowerCase()}.`,
      });
      setPending(null);
      setValues({});
      setReloadKey((key) => key + 1);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : `${action.label} failed`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => resource.columns, [resource.columns]);
  const hasActions = Boolean(resource.actions?.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-purple-300">
            Privileged queue
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {resource.label}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {resource.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resource.searchParam && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={resource.searchPlaceholder ?? 'Search…'}
                aria-label={`Search ${resource.label.toLowerCase()}`}
                className="h-10 w-full rounded-md border border-white/12 bg-[#161e2e] pl-9 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30 sm:w-64"
              />
            </div>
          )}
          {resource.statuses && (
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label={`Filter ${resource.label.toLowerCase()} by status`}
              className="h-10 rounded-md border border-white/12 bg-[#161e2e] px-3 text-sm text-slate-100 focus-visible:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30"
            >
              <option value="">All statuses</option>
              {resource.statuses.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
            isLoading={isLoading}
            className="border-white/15 bg-white/[0.04] text-slate-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            feedback.tone === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-400/30 bg-red-500/10 text-red-200'
          )}
        >
          {feedback.message}
        </div>
      )}

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
                {columns.map((column) => (
                  <th key={column.header} className="px-4 py-3 font-semibold">
                    {column.header}
                  </th>
                ))}
                {hasActions && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-white/5">
                    {columns.map((column) => (
                      <td key={column.header} className="px-4 py-3.5">
                        <span className="block h-3.5 w-full max-w-[9rem] animate-pulse rounded bg-white/[0.06]" />
                      </td>
                    ))}
                    {hasActions && <td className="px-4 py-3.5" />}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-5 py-16">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <ShieldAlert className="h-5 w-5 text-slate-600" />
                      <p className="text-sm text-slate-400">
                        Nothing in this queue{status ? ` with status ${status.replace(/_/g, ' ').toLowerCase()}` : ''}.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={String(row.id ?? row.reference ?? index)}
                    className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[0.03]"
                  >
                    {columns.map((column) => (
                      <td key={column.header} className={cn('px-4 py-3.5 align-middle', column.className)}>
                        {cell(row, column)}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          {(resource.actions ?? []).map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              onClick={() => openAction(action, row)}
                              className={cn(
                                'rounded-md border px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors',
                                actionToneClass(action.tone)
                              )}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-white/10 px-4 py-3.5 sm:flex-row">
          <p className="text-xs text-slate-500">
            {meta.total > 0
              ? `Page ${page} of ${Math.max(meta.totalPages, 1)} · ${meta.total} ${resource.label.toLowerCase()}`
              : 'No records'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || isLoading}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-45"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= Math.max(meta.totalPages, 1) || isLoading}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-45"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </AdminCard>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-action-title"
            className="w-full max-w-lg animate-fade-up overflow-hidden rounded-t-2xl border border-purple-500/25 bg-[#161e2e] shadow-2xl sm:rounded-xl"
          >
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-purple-300">
                {pending.action.label}
              </p>
              <h2 id="admin-action-title" className="mt-1.5 text-lg font-semibold text-white">
                {String(
                  pending.row.reference ??
                    pending.row.email ??
                    pending.row.id ??
                    resource.singular
                )}
              </h2>
              {pending.action.description && (
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  {pending.action.description}
                </p>
              )}
            </div>

            {(pending.action.fields ?? []).length > 0 && (
              <div className="space-y-4 px-6 py-5">
                {(pending.action.fields ?? []).map((field) => (
                  <div key={field.name}>
                    <label
                      htmlFor={`action-${field.name}`}
                      className="mb-1.5 block text-sm font-semibold text-slate-200"
                    >
                      {field.label}
                      {field.required && <span className="text-red-300"> *</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        id={`action-${field.name}`}
                        rows={3}
                        value={values[field.name] ?? ''}
                        onChange={(event) =>
                          setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full rounded-md border border-white/12 bg-[#0b0f19] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30"
                      />
                    ) : (
                      <input
                        id={`action-${field.name}`}
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={values[field.name] ?? ''}
                        onChange={(event) =>
                          setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="h-11 w-full rounded-md border border-white/12 bg-[#0b0f19] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="h-9 rounded-md border border-white/12 bg-white/[0.04] px-3.5 text-[0.8125rem] font-semibold text-slate-200 transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
              <Button type="button" onClick={submitAction} isLoading={isSubmitting}>
                {pending.action.label}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResourceConsole;
