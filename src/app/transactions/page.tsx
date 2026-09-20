// src/app/transactions/page.tsx
// Transactions List Page

'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftRight, Filter } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useTransactions } from '@/hooks';
import type { Transaction } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

function statusVariant(status: string) {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return 'success' as const;
    case 'pending':
    case 'processing':
      return 'warning' as const;
    case 'failed':
    case 'reversed':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

function typeVariant(type: string) {
  switch ((type || '').toLowerCase()) {
    case 'credit':
    case 'deposit':
      return 'success' as const;
    case 'debit':
    case 'withdrawal':
    case 'fee':
      return 'warning' as const;
    case 'transfer':
      return 'info' as const;
    default:
      return 'secondary' as const;
  }
}

function TransactionsPageContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') || undefined;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const { transactions, total, totalPages, isLoading, error, refetch } = useTransactions({
    page,
    limit,
    accountId,
    type: type || undefined,
    status: status || undefined,
  });

  const applyFilters = (nextPage = page) => {
    setPage(nextPage);
    refetch({ page: nextPage, limit, accountId, type: type || undefined, status: status || undefined });
  };

  const columns: Column<Transaction>[] = [
    {
      header: 'Date',
      cell: (row) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      header: 'Reference',
      cell: (row) => (
        <Link
          href={`/transactions/${row.id}`}
          className="font-mono text-sm font-medium text-primary hover:underline"
        >
          {row.reference}
        </Link>
      ),
    },
    {
      header: 'Type',
      cell: (row) => <Badge variant={typeVariant(row.type)}>{row.type}</Badge>,
    },
    {
      header: 'Description',
      cell: (row) => (
        <span className="text-sm text-foreground">{row.description || '—'}</span>
      ),
    },
    {
      header: 'Account',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.account?.name || `•••• ${String(row.accountId || '').slice(-4)}`}
        </span>
      ),
    },
    {
      header: 'Amount',
      className: 'text-right',
      cell: (row) => (
        <span className="block text-right text-sm font-semibold">
          {formatCurrency(row.amount, row.currency)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (row) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/transactions/${row.id}`}>Receipt</Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="Transactions"
        description={
          accountId
            ? 'Every movement on the selected account, newest first.'
            : 'A complete, searchable history of everything that has moved through your accounts.'
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/deposit">Make a deposit</Link>
          </Button>
        }
      />

      <section className="chase-card mb-6 p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
            <Filter className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Refine your history</h2>
            <p className="text-sm text-muted-foreground">
              Filter by transaction type, status or how many records to show.
            </p>
          </div>
        </div>

        <form
          className="mt-5 grid gap-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters(1);
          }}
        >
          <Select label="Type" value={type} onValueChange={setType} placeholder="All types">
            <Select.Option value="">All types</Select.Option>
            <Select.Option value="credit">Credit</Select.Option>
            <Select.Option value="debit">Debit</Select.Option>
            <Select.Option value="transfer">Transfer</Select.Option>
            <Select.Option value="fee">Fee</Select.Option>
            <Select.Option value="deposit">Deposit</Select.Option>
            <Select.Option value="withdrawal">Withdrawal</Select.Option>
          </Select>
          <Select label="Status" value={status} onValueChange={setStatus} placeholder="All statuses">
            <Select.Option value="">All statuses</Select.Option>
            <Select.Option value="completed">Completed</Select.Option>
            <Select.Option value="pending">Pending</Select.Option>
            <Select.Option value="failed">Failed</Select.Option>
          </Select>
          <Select
            label="Rows per page"
            value={String(limit)}
            onValueChange={(value) => setLimit(Number(value))}
          >
            <Select.Option value="5">5 per page</Select.Option>
            <Select.Option value="10">10 per page</Select.Option>
            <Select.Option value="25">25 per page</Select.Option>
            <Select.Option value="50">50 per page</Select.Option>
          </Select>
          <div className="flex items-end gap-2.5">
            <Button type="submit" isLoading={isLoading}>
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setType('');
                setStatus('');
                setLimit(10);
                setPage(1);
                refetch({ page: 1, limit: 10, accountId });
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </section>

      <section className="chase-card p-6">
        {isLoading && page === 1 ? (
          <LoadingRows rows={5} />
        ) : error ? (
          <ErrorState
            title="We could not load your transactions"
            description={error}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Nothing to show yet"
            description="Once money moves in or out of your accounts, each transaction appears here with its receipt."
            action={
              <Button asChild>
                <Link href="/transfer">Send your first transfer</Link>
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={transactions}
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

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-muted-foreground">
          Loading transactions…
        </div>
      }
    >
      <TransactionsPageContent />
    </Suspense>
  );
}
