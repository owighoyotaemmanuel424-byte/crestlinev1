// src/app/accounts/[id]/page.tsx
// Account Detail Page

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Landmark,
  Send,
  Upload,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { useAccount, useTransactions } from '@/hooks';
import type { Transaction } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

function statusVariant(status: string) {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'completed':
      return 'success' as const;
    case 'frozen':
    case 'pending':
      return 'warning' as const;
    case 'closed':
    case 'failed':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { account, isLoading, error, refetch } = useAccount(id);
  const transactions = useTransactions({ accountId: id, limit: 5 });

  const transactionColumns: Column<Transaction>[] = [
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
      header: 'Description',
      cell: (row) => <span className="text-sm">{row.description || row.type}</span>,
    },
    {
      header: 'Amount',
      className: 'text-right',
      cell: (row) => (
        <span className="block text-right text-sm font-semibold">
          {formatCurrency(row.amount, row.currency || account?.currency)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
  ];

  if (isLoading) {
    return (
      <div>
        <PageHeader
          eyebrow="Account details"
          title="Loading account…"
          description="Fetching balances and account details."
        />
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div>
        <PageHeader eyebrow="Account details" title="Account unavailable" />
        <ErrorState
          title="We could not load this account"
          description={error || 'This account may have been closed or is not available on your profile.'}
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => router.push('/accounts')}>
                Back to accounts
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All accounts
      </Link>

      <PageHeader
        eyebrow={`${account.accountType || 'Account'} · ${account.currency}`}
        title={account.name}
        description={`Account number •••• ${String(account.accountNumber || '').slice(-4)} · opened ${new Date(
          account.createdAt
        ).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        actions={
          <>
            <Badge variant={statusVariant(account.status)} size="lg">
              {account.status}
            </Badge>
            <Button asChild>
              <Link href={`/transfer?accountId=${account.id}`}>
                <Send className="h-4 w-4" />
                Send money
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Current balance"
          value={formatCurrency(account.balance, account.currency)}
          hint="Including pending items"
          icon={Wallet}
          tone="primary"
          className="sm:col-span-2"
        />
        <StatCard
          label="Available balance"
          value={formatCurrency(account.availableBalance, account.currency)}
          hint="Ready to spend"
          icon={Landmark}
          tone="success"
        />
        <StatCard
          label="Recent activity"
          value={String(transactions.total || transactions.transactions.length)}
          hint="Last 5 shown below"
          icon={ArrowRight}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="chase-card p-6">
          <h2 className="text-base font-semibold tracking-tight">Recent transactions</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The five most recent movements on this account.
          </p>

          <div className="mt-5">
            {transactions.isLoading ? (
              <LoadingRows rows={3} />
            ) : transactions.error ? (
              <ErrorState
                title="Activity unavailable"
                description={transactions.error}
                action={
                  <Button variant="outline" size="sm" onClick={() => transactions.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : transactions.transactions.length === 0 ? (
              <EmptyState
                title="No transactions on this account yet"
                description="Deposits, transfers and card activity will appear here."
                action={
                  <Button asChild size="sm">
                    <Link href={`/deposit?accountId=${account.id}`}>Make a deposit</Link>
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={transactionColumns}
                data={transactions.transactions}
                keyExtractor={(row) => row.id}
              />
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/transactions?accountId=${account.id}`}>
                View all activity
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="chase-card p-6">
            <h2 className="text-base font-semibold tracking-tight">Account details</h2>
            <dl className="mt-5 space-y-4 text-sm">
              {(
                [
                  { label: 'Account holder', value: account.user ? `${account.user.firstName} ${account.user.lastName}` : 'You' },
                  { label: 'Account name', value: account.name },
                  { label: 'Account number', value: `•••• ${String(account.accountNumber || '').slice(-4)}`, mono: true },
                  { label: 'Account type', value: (account.accountType || '').toLowerCase(), capitalize: true },
                  { label: 'Currency', value: account.currency },
                ] as { label: string; value: string; mono?: boolean; capitalize?: boolean }[]
              ).map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd
                    className={
                      'text-right font-medium text-foreground ' +
                      (row.mono ? 'font-mono' : '') +
                      (row.capitalize ? ' capitalize' : '')
                    }
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="chase-card p-6">
            <h2 className="text-base font-semibold tracking-tight">Quick actions</h2>
            <div className="mt-5 space-y-2.5">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/transfer?accountId=${account.id}`}>
                  <Send className="h-4 w-4" />
                  Send money from this account
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/deposit?accountId=${account.id}`}>
                  <Download className="h-4 w-4" />
                  Deposit into this account
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/withdraw?accountId=${account.id}`}>
                  <Upload className="h-4 w-4" />
                  Withdraw from this account
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
