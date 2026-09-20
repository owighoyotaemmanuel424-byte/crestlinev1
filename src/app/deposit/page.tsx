// src/app/deposit/page.tsx
// Deposit funds

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Download, Landmark } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useAccounts, useDeposits, useToast } from '@/hooks';
import { formatCurrency } from '@/lib/utils';

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash deposit' },
  { value: 'mobile_money', label: 'Mobile money' },
];

function DepositPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

  const accounts = useAccounts({ limit: 100 });
  const { createDeposit } = useDeposits();

  const [form, setForm] = useState({
    accountId: searchParams.get('accountId') || '',
    amount: '',
    method: 'bank_transfer',
    description: '',
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState('');

  const account = accounts.accounts.find((item) => item.id === form.accountId);
  const amountValue = Number(form.amount) || 0;
  const canSubmit = Boolean(form.accountId) && amountValue > 0;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setIsSubmitting(true);
    setFormError('');
    try {
      const deposit = await createDeposit({
        accountId: form.accountId,
        amount: Math.round(amountValue * 100),
        currency: account?.currency || 'USD',
        method: form.method,
        description: form.description || `Deposit via ${form.method.replace('_', ' ')}`,
        idempotencyKey: `deposit-${Date.now()}`,
      } as any);
      setReference(deposit.reference || '');
      success('Deposit submitted for confirmation', 'Deposit created');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Deposit failed';
      setFormError(message);
      showError(message, 'Deposit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (reference) {
    return (
      <div>
        <PageHeader eyebrow="Add funds" title="Deposit complete" />
        <div className="chase-card mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Deposit received</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {formatCurrency(amountValue, account?.currency || 'USD')} is being credited to{' '}
            {account?.name}.
          </p>
          <p className="mt-4 rounded-lg bg-muted px-4 py-3 font-mono text-sm">{reference}</p>
          <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Button asChild>
              <Link href="/accounts">View accounts</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReference('');
                setForm({ accountId: '', amount: '', method: 'bank_transfer', description: '' });
              }}
            >
              Make another deposit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Add funds"
        title="Deposit money"
        description="Top up any account by bank transfer, cash or mobile money. Funds appear once the deposit is confirmed."
        actions={
          <Button asChild variant="ghost">
            <Link href="/accounts">Back to accounts</Link>
          </Button>
        }
      />

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
              title="No accounts to deposit into"
              description="Open an account first and it will appear here."
              action={
                <Button asChild>
                  <Link href="/accounts">View accounts</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-5">
              <Select
                label="Deposit into"
                value={form.accountId}
                onValueChange={(value) => setForm((previous) => ({ ...previous, accountId: value }))}
                placeholder="Select an account"
                icon={Landmark}
              >
                {accounts.accounts.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.name} · {formatCurrency(item.balance, item.currency)}
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
                hint="Minimum deposit is 1.00"
              />

              <Select
                label="Deposit method"
                value={form.method}
                onValueChange={(value) => setForm((previous) => ({ ...previous, method: value }))}
              >
                {METHODS.map((method) => (
                  <Select.Option key={method.value} value={method.value}>
                    {method.label}
                  </Select.Option>
                ))}
              </Select>

              <Input
                label="Description (optional)"
                value={form.description}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="e.g. Monthly savings"
              />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="chase-card p-6">
            <h2 className="text-base font-semibold tracking-tight">Deposit summary</h2>
            <dl className="mt-5 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="text-right font-medium">{account?.name || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Method</dt>
                <dd className="text-right font-medium capitalize">
                  {form.method.replace('_', ' ')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Fee</dt>
                <dd className="font-medium text-success">Free</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3.5">
                <dt className="font-semibold">Total credit</dt>
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
              <Download className="h-4 w-4" />
              Submit deposit
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Deposits are reviewed for compliance. You will get a notification the moment
              funds are available.
            </p>
          </div>

          <div className="chase-card p-6">
            <h3 className="text-sm font-semibold text-foreground">How long does it take?</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Bank transfer — usually the same business day</li>
              <li>Cash deposit — instantly once confirmed at a branch</li>
              <li>Mobile money — a few minutes</li>
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 px-0"
              onClick={() => router.push('/support')}
            >
              Questions about a deposit?
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm your deposit"
        description="Check the details before we submit this deposit for processing."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              Confirm deposit
            </Button>
          </>
        }
      >
        <dl className="space-y-3.5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-lg font-bold">
              {formatCurrency(amountValue, account?.currency || 'USD')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Into</dt>
            <dd className="text-right font-medium">{account?.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Method</dt>
            <dd className="font-medium capitalize">{form.method.replace('_', ' ')}</dd>
          </div>
        </dl>
      </Dialog>
    </div>
  );
}

export default function DepositPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-muted-foreground">Loading deposit…</div>
      }
    >
      <DepositPageContent />
    </Suspense>
  );
}
