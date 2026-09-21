// src/app/accounts/page.tsx
// Customer Accounts Page

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Landmark, Search, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useAccounts } from '@/hooks';
import type { Account } from '@/lib/api';
import { formatCurrency, toAmount } from '@/lib/utils';

function statusVariant(status: string) {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'success' as const;
    case 'frozen':
    case 'pending':
      return 'warning' as const;
    case 'closed':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function AccountsPage() {
  const { accounts, total, page, totalPages, isLoading, error, refetch } = useAccounts({
    page: 1,
    limit: 10,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [accountType, setAccountType] = useState('');

  const applyFilters = (nextPage = 1) => {
    refetch({ page: nextPage, limit: 10, search, status, accountType });
  };

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setAccountType('');
    refetch({ page: 1, limit: 10 });
  };

  const totalBalance = accounts.reduce((sum, account) => sum + toAmount(account.balance), 0);
  const totalAvailable = accounts.reduce(
    (sum, account) => sum + toAmount(account.availableBalance),
    0
  );
  const currency = accounts[0]?.currency || 'USD';

  const columns: Column<Account>[] = [
    {
      header: 'Account',
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/accounts/${row.id}`}
            className="block truncate text-sm font-semibold text-foreground hover:text-primary"
          >
            {row.name}
          </Link>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            •••• {String(row.accountNumber || '').slice(-4)}
          </p>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (row) => (
        <span className="text-sm capitalize text-muted-foreground">
          {row.accountType?.toLowerCase()}
        </span>
      ),
    },
    {
      header: 'Currency',
      cell: (row) => <span className="text-sm font-medium">{row.currency}</span>,
    },
    {
      header: 'Balance',
      className: 'text-right',
      cell: (row) => (
        <span className="block text-right text-sm font-semibold">
          {formatCurrency(row.balance, row.currency)}
        </span>
      ),
    },
    {
      header: 'Available',
      className: 'text-right',
      cell: (row) => (
        <span className="block text-right text-sm text-muted-foreground">
          {formatCurrency(row.availableBalance, row.currency)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
    {
      header: 'Opened',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (row) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/accounts/${row.id}`}>View</Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Everyday banking"
        title="Accounts"
        description="Every Crestline Capital account you hold, with live balances, status and statements."
        actions={
          <>
            <Button asChild>
              <Link href="/transfer">
                <Send className="h-4 w-4" />
                Send money
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/deposit">
                <Download className="h-4 w-4" />
                Deposit
              </Link>
            </Button>
          </>
        }
      />

      {!isLoading && !error && accounts.length > 0 && (
        <div className="mb-6 grid gap-5 sm:grid-cols-3">
          <StatCard
            label="Combined balance"
            value={formatCurrency(totalBalance, currency)}
            hint={`${total} account${total === 1 ? '' : 's'}`}
            icon={Landmark}
            tone="primary"
          />
          <StatCard
            label="Available to spend"
            value={formatCurrency(totalAvailable, currency)}
            hint="After pending holds"
            icon={Download}
            tone="success"
          />
          <StatCard
            label="Accounts on this page"
            value={String(accounts.length)}
            hint={`Page ${page} of ${Math.max(totalPages, 1)}`}
            icon={Search}
          />
        </div>
      )}

      <section className="chase-card mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Filter accounts</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Narrow the list by name, status or account type.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        </div>

        <form
          className="mt-5 grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <Input
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Account name or number"
          />
          <Select
            label="Status"
            value={status}
            onValueChange={setStatus}
            placeholder="All statuses"
          >
            <Select.Option value="">All statuses</Select.Option>
            <Select.Option value="active">Active</Select.Option>
            <Select.Option value="frozen">Frozen</Select.Option>
            <Select.Option value="pending">Pending</Select.Option>
            <Select.Option value="closed">Closed</Select.Option>
          </Select>
          <Select
            label="Account type"
            value={accountType}
            onValueChange={setAccountType}
            placeholder="All types"
          >
            <Select.Option value="">All types</Select.Option>
            <Select.Option value="savings">Savings</Select.Option>
            <Select.Option value="current">Current</Select.Option>
            <Select.Option value="domiciliary">Domiciliary</Select.Option>
          </Select>
          <div className="md:col-span-3">
            <Button type="submit" isLoading={isLoading}>
              Apply filters
            </Button>
          </div>
        </form>
      </section>

      <section className="chase-card p-6">
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : error ? (
          <ErrorState
            title="We could not load your accounts"
            description={error}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title={search || status || accountType ? 'No accounts match those filters' : 'No accounts yet'}
            description={
              search || status || accountType
                ? 'Try widening your search or clearing the filters.'
                : 'Your accounts will appear here as soon as they are opened for you.'
            }
            action={
              search || status || accountType ? (
                <Button variant="outline" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/support">Talk to an account specialist</Link>
                </Button>
              )
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={accounts}
            keyExtractor={(row) => row.id}
            pagination={{
              currentPage: page,
              totalPages: Math.max(totalPages, 1),
              totalItems: total,
              onPageChange: (nextPage) => applyFilters(nextPage),
            }}
          />
        )}
      </section>
    </div>
  );
}
