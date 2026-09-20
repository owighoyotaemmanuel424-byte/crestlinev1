// src/app/withdraw/page.tsx
// Withdraw funds

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Landmark, Upload } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useAccounts, useToast, useWithdrawals } from '@/hooks';
import { formatCurrency, toAmount } from '@/lib/utils';

function statusVariant(status: string) {
  switch ((status || '').toLowerCase()) {
    case 'completed':
    case 'approved':
      return 'success' as const;
    case 'pending':
    case 'hold':
    case 'under_review':
      return 'warning' as const;
    case 'failed':
    case 'rejected':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

function WithdrawPageContent() {
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

  const accounts = useAccounts({ limit: 100 });
  const withdrawals = useWithdrawals({ limit: 5 });
  const { createWithdrawal } = withdrawals;

  const [form, setForm] = useState({
    accountId: searchParams.get('accountId') || '',
    amount: '',
    destinationBank: '',
    destinationAccountNumber: '',
    description: '',
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState('');

  const account = accounts.accounts.find((item) => item.id === form.accountId);
  const amountValue = Number(form.amount) || 0;
  const insufficient = Boolean(account) && amountValue * 100 > toAmount(account?.availableBalance);
  const canSubmit =
    Boolean(form.accountId) &&
    amountValue > 0 &&
    !insufficient &&
    Boolean(form.destinationBank.trim()) &&
    Boolean(form.destinationAccountNumber.trim());

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setIsSubmitting(true);
    setFormError('');
    try {
      const withdrawal = await createWithdrawal({
        accountId: form.accountId,
        amount: Math.round(amountValue * 100),
        currency: account?.currency || 'USD',
        method: 'bank_transfer',
        destination: `${form.destinationBank} · ${form.destinationAccountNumber}`,
        // The API route also accepts explicit destination fields.
        destinationBank: form.destinationBank,
        destinationAccountNumber: form.destinationAccountNumber,
        description: form.description || `Withdrawal to ${form.destinationBank}`,
        idempotencyKey: `withdrawal-${Date.now()}`,
      } as any);
      setReference(withdrawal.reference || '');
      success('Withdrawal requested', 'Request submitted');
      withdrawals.refetch();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Withdrawal failed';
      setFormError(message);
      showError(message, 'Withdrawal failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Move money"
        title="Withdraw money"
        description="Send funds from a Crestline account to an external bank account. Requests are reviewed before payout."
        actions={
          <Button asChild variant="ghost">
            <Link href="/accounts">Back to accounts</Link>
          </Button>
        }
      />

      {reference && (
        <Alert variant="success" className="mb-5">
          <AlertDescription>
            Withdrawal requested — reference <span className="font-mono">{reference}</span>. You
            will be notified when it is approved.
          </AlertDescription>
        </Alert>
      )}

      {formError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="chase-card p-6 sm:p-7">
          {accounts.isLoading ? (
            <LoadingRows rows={3} />
          ) : accounts.accounts.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No accounts to withdraw from"
              description="Once you hold an account you can request payouts to any bank."
            />
          ) : (
            <div className="space-y-5">
              <Select
                label="Withdraw from"
                value={form.accountId}
                onValueChange={(value) => setForm((previous) => ({ ...previous, accountId: value }))}
                placeholder="Select an account"
                icon={Landmark}
              >
                {accounts.accounts.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.name} · {formatCurrency(item.availableBalance, item.currency)} available
                  </Select.Option>
                ))}
              </Select>

              <Input
                type="number"
                inputMode="decimal"
                label={`Amount (${account?.currency || 'USD'})`}
                value={form.amount}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, amount: event.target.value }))
                }
                placeholder="0.00"
                min="0"
                step="0.01"
                error={insufficient ? 'That is more than the available balance.' : undefined}
                hint={
                  account
                    ? `${formatCurrency(account.availableBalance, account.currency)} available`
                    : undefined
                }
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Destination bank"
                  value={form.destinationBank}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, destinationBank: event.target.value }))
                  }
                  placeholder="e.g. Sterling Bank"
                />
                <Input
                  label="Destination account number"
                  value={form.destinationAccountNumber}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      destinationAccountNumber: event.target.value,
                    }))
                  }
                  placeholder="0123456789"
                />
              </div>

              <Input
                label="Description (optional)"
                value={form.description}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="e.g. School fees"
              />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="chase-card p-6">
            <h2 className="text-base font-semibold tracking-tight">Withdrawal summary</h2>
            <dl className="mt-5 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">From</dt>
                <dd className="text-right font-medium">{account?.name || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">To</dt>
                <dd className="text-right font-medium">
                  {form.destinationBank || '—'}
                  {form.destinationAccountNumber
                    ? ` · •••• ${form.destinationAccountNumber.slice(-4)}`
                    : ''}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3.5">
                <dt className="font-semibold">Total debit</dt>
                <dd className="text-lg font-bold">
                  {formatCurrency(amountValue, account?.currency || 'USD')}
                </dd>
              </div>
            </dl>
            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={!canSubmit}
              isLoading={isSubmitting}
              onClick={() => setConfirmOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Request withdrawal
            </Button>
          </div>

          <div className="chase-card p-6">
            <h2 className="text-base font-semibold tracking-tight">Recent requests</h2>
            {withdrawals.isLoading ? (
              <div className="mt-4">
                <LoadingRows rows={2} />
              </div>
            ) : withdrawals.withdrawals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No withdrawal requests on record yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {withdrawals.withdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatCurrency(withdrawal.amount, withdrawal.currency)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {withdrawal.destination || withdrawal.method || 'External account'} ·{' '}
                        {new Date(withdrawal.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <Badge variant={statusVariant(withdrawal.status)}>{withdrawal.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm withdrawal request"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              Confirm request
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            We will debit {account?.name} for{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(amountValue, account?.currency || 'USD')}
            </span>{' '}
            and send it to {form.destinationBank} (••••{' '}
            {form.destinationAccountNumber.slice(-4)}).
          </p>
          <div className="flex items-center gap-2.5 rounded-lg bg-muted p-3.5">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground">
              You can track the request status from this page or your notifications.
            </span>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function WithdrawPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-muted-foreground">Loading withdraw…</div>
      }
    >
      <WithdrawPageContent />
    </Suspense>
  );
}
