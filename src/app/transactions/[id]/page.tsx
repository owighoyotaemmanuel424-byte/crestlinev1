// src/app/transactions/[id]/page.tsx
// Transaction Detail Page

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Landmark, Printer } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useTransaction } from '@/hooks';
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

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { transaction, isLoading, error, refetch } = useTransaction(id);

  if (isLoading) {
    return (
      <div>
        <PageHeader eyebrow="Receipt" title="Loading transaction…" />
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div>
        <PageHeader eyebrow="Receipt" title="Transaction unavailable" />
        <ErrorState
          title="We could not load this transaction"
          description={error || 'The transaction may have been archived or is not linked to your profile.'}
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => router.push('/transactions')}>
                Back to transactions
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const isCredit = /credit|deposit|refund|interest/i.test(transaction.type || '');

  const details: { label: string; value: string; mono?: boolean; capitalize?: boolean }[] = [
    { label: 'Status', value: transaction.status, capitalize: true },
    { label: 'Type', value: transaction.type, capitalize: true },
    { label: 'Description', value: transaction.description || '—' },
    { label: 'Currency', value: transaction.currency },
    { label: 'Journal entry', value: transaction.journalId || '—', mono: true },
    { label: 'Account', value: transaction.accountId || '—', mono: true },
    { label: 'Requested by', value: transaction.userId || '—', mono: true },
  ];

  return (
    <div className="space-y-7">
      <Link
        href="/transactions"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All transactions
      </Link>

      <PageHeader
        eyebrow="Transaction receipt"
        title={transaction.reference || 'Transaction'}
        description={`Recorded ${new Date(transaction.createdAt).toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`}
        actions={
          <>
            <Badge variant={statusVariant(transaction.status)} size="lg">
              {transaction.status}
            </Badge>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print receipt
            </Button>
          </>
        }
      />

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="chase-navy relative overflow-hidden rounded-xl p-7 text-white shadow-elevated">
          <div className="chase-grid-lines absolute inset-0 opacity-25" aria-hidden="true" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-200">
              {isCredit ? 'Money in' : 'Money out'}
            </p>
            <p className="mt-3 text-4xl font-bold tracking-tight">
              {isCredit ? '+ ' : '- '}
              {formatCurrency(transaction.amount, transaction.currency)}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              {transaction.description || 'No description was recorded for this movement.'}
            </p>

            <dl className="mt-8 grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/55">
                  Reference
                </dt>
                <dd className="mt-1.5 font-mono text-sm">{transaction.reference}</dd>
              </div>
              <div>
                <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/55">
                  Settled
                </dt>
                <dd className="mt-1.5 text-sm">
                  {transaction.completedAt
                    ? new Date(transaction.completedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Awaiting settlement'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="chase-card p-6">
          <h2 className="text-base font-semibold tracking-tight">Transaction details</h2>
          <dl className="mt-5 space-y-4 text-sm">
            {details.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd
                  className={
                    'max-w-[60%] break-words text-right font-medium text-foreground ' +
                    (row.mono ? 'font-mono text-xs' : '') +
                    (row.capitalize ? ' capitalize' : '')
                  }
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="flex flex-wrap gap-2.5">
        <Button asChild variant="outline">
          <Link href={`/accounts/${transaction.accountId}`}>
            <Landmark className="h-4 w-4" />
            View account
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/transactions">
            Back to all transactions
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
