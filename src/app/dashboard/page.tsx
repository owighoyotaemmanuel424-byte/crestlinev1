'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  ChevronRight,
  CreditCard,
  Download,
  Landmark,
  PiggyBank,
  Send,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useAccounts, useApiResource, useTransactions } from '@/hooks';
import { cn, formatCurrency, toAmount } from '@/lib/utils';

const QUICK_ACTIONS = [
  { href: '/transfer', label: 'Send money', description: 'Pay anyone', icon: Send },
  { href: '/deposit', label: 'Deposit', description: 'Add funds', icon: Download },
  { href: '/withdraw', label: 'Withdraw', description: 'Move out', icon: Upload },
  { href: '/cards', label: 'Cards', description: 'Freeze or report', icon: CreditCard },
];

function statusVariant(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'completed':
      return 'success' as const;
    case 'pending':
    case 'frozen':
    case 'hold':
      return 'warning' as const;
    case 'failed':
    case 'closed':
    case 'rejected':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function DashboardPage() {
  const accounts = useAccounts({ limit: 6 });
  const transactions = useTransactions({ limit: 6 });
  const profile = useApiResource<any>('/api/profile');

  const [greeting, setGreeting] = useState('Welcome back');
  const [today, setToday] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
    setToday(
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    );
  }, []);

  const firstName =
    profile.data?.firstName || profile.data?.user?.firstName || 'there';

  const totalBalance = accounts.accounts.reduce(
    (sum, account) => sum + toAmount(account.balance),
    0
  );
  const availableBalance = accounts.accounts.reduce(
    (sum, account) => sum + toAmount(account.availableBalance),
    0
  );
  const currency = accounts.accounts[0]?.currency || 'USD';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Online banking"
        title={`${greeting}, ${firstName}`}
        description={today ? `Here is everything happening across your accounts on ${today}.` : 'Here is everything happening across your accounts.'}
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

      {/* Balance + verification */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="chase-navy relative overflow-hidden rounded-xl p-6 text-white shadow-elevated lg:col-span-2">
          <div className="chase-grid-lines absolute inset-0 opacity-25" aria-hidden="true" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-200">
              Total balance
            </p>
            <p className="mt-2 text-4xl font-bold tracking-tight">
              {accounts.isLoading ? '—' : formatCurrency(totalBalance, currency)}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {accounts.isLoading
                ? 'Loading your accounts…'
                : `${accounts.total} account${accounts.total === 1 ? '' : 's'} · ${formatCurrency(
                    availableBalance,
                    currency
                  )} available to spend`}
            </p>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group rounded-lg border border-white/12 bg-white/[0.07] p-3.5 transition-colors hover:bg-white/[0.13]"
                >
                  <action.icon className="h-[18px] w-[18px] text-primary-200" />
                  <p className="mt-2.5 text-sm font-semibold leading-tight">{action.label}</p>
                  <p className="mt-0.5 text-[0.7rem] text-white/60">{action.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="chase-card flex flex-col p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold tracking-tight">Account protection</h2>
          </div>
          <ul className="mt-5 space-y-3.5 text-sm">
            <li className="flex items-start gap-2.5">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span className="text-muted-foreground">
                Fraud monitoring active on every transaction
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span className="text-muted-foreground">
                Two-factor sign-in and device approvals
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">
                Instant alerts for deposits and card spend
              </span>
            </li>
          </ul>
          <div className="mt-auto flex gap-2.5 pt-6">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href="/kyc">Verification</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="flex-1">
              <Link href="/settings">Settings</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Accounts */}
      <section className="chase-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Your accounts</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Balances update as soon as a transaction settles.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/accounts">
              View all
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="p-6">
          {accounts.isLoading ? (
            <LoadingRows rows={2} />
          ) : accounts.error ? (
            <ErrorState
              title="Accounts are unavailable"
              description={accounts.error}
              action={
                <Button variant="outline" size="sm" onClick={() => accounts.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : accounts.accounts.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No accounts yet"
              description="Once your first account is opened it will appear here with its balance and status."
              action={
                <Button asChild>
                  <Link href="/accounts">
                    <Landmark className="h-4 w-4" />
                    Explore accounts
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {accounts.accounts.map((account) => (
                <li key={account.id}>
                  <Link
                    href={`/accounts/${account.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                        {account.accountType?.toLowerCase().includes('saving') ? (
                          <PiggyBank className="h-[18px] w-[18px]" />
                        ) : (
                          <Landmark className="h-[18px] w-[18px]" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {account.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{account.accountType?.toLowerCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">
                            •••• {String(account.accountNumber || '').slice(-4)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <Badge variant={statusVariant(account.status)}>{account.status}</Badge>
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-foreground">
                          {formatCurrency(account.balance, account.currency)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatCurrency(account.availableBalance, account.currency)} available
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Recent activity */}
      <section className="chase-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Recent activity</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The latest movements across every account you hold.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/transactions">
              All transactions
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="p-6">
          {transactions.isLoading ? (
            <LoadingRows rows={4} />
          ) : transactions.error ? (
            <ErrorState
              title="Activity is unavailable"
              description={transactions.error}
              action={
                <Button variant="outline" size="sm" onClick={() => transactions.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : transactions.transactions.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transactions yet"
              description="Deposits, card payments and transfers will show up here the moment they are recorded."
              action={
                <Button asChild>
                  <Link href="/deposit">Make a deposit</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {transactions.transactions.map((transaction) => {
                const isCredit = /credit|deposit|refund|interest/i.test(transaction.type || '');
                return (
                  <li key={transaction.id}>
                    <Link
                      href={`/transactions/${transaction.id}`}
                      className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            isCredit
                              ? 'bg-success/10 text-success'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {isCredit ? (
                            <Download className="h-[18px] w-[18px]" />
                          ) : (
                            <Upload className="h-[18px] w-[18px]" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {transaction.description || transaction.type}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {transaction.reference ? ` · ${transaction.reference}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={statusVariant(transaction.status)}>
                          {transaction.status}
                        </Badge>
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            isCredit ? 'text-success' : 'text-foreground'
                          )}
                        >
                          {isCredit ? '+ ' : '- '}
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
