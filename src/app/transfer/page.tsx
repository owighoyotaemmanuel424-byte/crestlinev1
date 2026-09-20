// src/app/transfer/page.tsx
// Send money — three step wizard

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Landmark,
  Send,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useAccounts, useBeneficiaries, useToast, useTransfers } from '@/hooks';
import { cn, formatCurrency, toAmount } from '@/lib/utils';

const STEPS = ['Source account', 'Recipient', 'Amount'];

function TransferPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

  const accounts = useAccounts({ limit: 100 });
  const beneficiaries = useBeneficiaries({ limit: 100 });
  const { createTransfer } = useTransfers();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    senderAccountId: searchParams.get('accountId') || '',
    recipientName: '',
    recipientBank: '',
    recipientAccountNumber: '',
    amount: '',
    description: '',
  });
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState('');

  const sender = accounts.accounts.find((account) => account.id === form.senderAccountId);
  const amountValue = Number(form.amount) || 0;
  const amountMinor = Math.round(amountValue * 100);
  const availableMinor = toAmount(sender?.availableBalance);
  const insufficient = Boolean(sender) && amountMinor > availableMinor;

  useEffect(() => {
    if (!beneficiaryId) return;
    const beneficiary = beneficiaries.beneficiaries.find((item) => item.id === beneficiaryId);
    if (beneficiary) {
      setForm((previous) => ({
        ...previous,
        recipientName: beneficiary.name,
        recipientBank: beneficiary.bankName,
        recipientAccountNumber: beneficiary.accountNumber,
      }));
    }
  }, [beneficiaryId, beneficiaries.beneficiaries]);

  const canContinue =
    step === 1
      ? Boolean(form.senderAccountId)
      : step === 2
        ? Boolean(
            beneficiaryId ||
              (form.recipientName && form.recipientBank && form.recipientAccountNumber)
          )
        : amountValue > 0 && !insufficient;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setIsSubmitting(true);
    setFormError('');
    try {
      const transfer = await createTransfer({
        senderAccountId: form.senderAccountId,
        recipientName: form.recipientName,
        recipientBank: form.recipientBank,
        recipientAccountNumber: form.recipientAccountNumber,
        amount: amountMinor,
        currency: sender?.currency || 'USD',
        description: form.description || `Transfer to ${form.recipientName}`,
        idempotencyKey: `transfer-${Date.now()}`,
      });
      setReference(transfer.reference || '');
      success('Transfer submitted for review', 'Transfer created');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Transfer failed';
      setFormError(message);
      showError(message, 'Transfer failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (reference) {
    return (
      <div>
        <PageHeader eyebrow="Send money" title="Transfer complete" />
        <div className="chase-card mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            Your transfer is on its way
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {formatCurrency(amountMinor / 100, sender?.currency || 'USD')} to{' '}
            {form.recipientName} has been submitted and is being screened.
          </p>
          <p className="mt-4 rounded-lg bg-muted px-4 py-3 font-mono text-sm">
            {reference}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Button asChild>
              <Link href="/transactions">View transaction history</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReference('');
                setStep(1);
                setForm({
                  senderAccountId: '',
                  recipientName: '',
                  recipientBank: '',
                  recipientAccountNumber: '',
                  amount: '',
                  description: '',
                });
                setBeneficiaryId('');
                accounts.refetch();
              }}
            >
              Send another transfer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Move money"
        title="Send money"
        description="Pay a saved beneficiary or a new account. Every transfer is screened for fraud before it leaves."
        actions={
          <Button asChild variant="ghost">
            <Link href="/beneficiaries">
              <Users className="h-4 w-4" />
              Manage beneficiaries
            </Link>
          </Button>
        }
      />

      {/* Stepper */}
      <ol className="mb-6 grid gap-3 sm:grid-cols-3">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const state = stepNumber < step ? 'done' : stepNumber === step ? 'current' : 'upcoming';
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-4',
                state === 'current'
                  ? 'border-primary/40 bg-accent'
                  : 'border-border bg-card'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  state === 'done'
                    ? 'bg-success text-white'
                    : state === 'current'
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
              </span>
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Step {stepNumber}
                </p>
                <p className="truncate text-sm font-semibold text-foreground">{label}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {formError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="chase-card p-6 sm:p-7">
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Where is the money coming from?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the account to debit. Available balance is shown for each.
            </p>

            <div className="mt-6">
              {accounts.isLoading ? (
                <LoadingRows rows={2} />
              ) : accounts.accounts.length === 0 ? (
                <EmptyState
                  icon={Landmark}
                  title="No accounts available"
                  description="You need at least one active account before you can send money."
                  action={
                    <Button asChild>
                      <Link href="/accounts">View accounts</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {accounts.accounts.map((account) => {
                    const selected = form.senderAccountId === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() =>
                          setForm((previous) => ({ ...previous, senderAccountId: account.id }))
                        }
                        className={cn(
                          'flex w-full flex-wrap items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors',
                          selected
                            ? 'border-primary bg-accent'
                            : 'border-border hover:border-primary/40 hover:bg-muted/50'
                        )}
                      >
                        <span className="flex items-center gap-3.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Landmark className="h-[18px] w-[18px]" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-foreground">
                              {account.name}
                            </span>
                            <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                              {account.accountType?.toLowerCase()} · ••••{' '}
                              {String(account.accountNumber || '').slice(-4)}
                            </span>
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-semibold">
                            {formatCurrency(account.availableBalance, account.currency)}
                          </span>
                          <span className="block text-xs text-muted-foreground">available</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Who are you paying?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a saved beneficiary or enter new account details.
            </p>

            <div className="mt-6 space-y-6">
              <Select
                label="Saved beneficiaries"
                value={beneficiaryId}
                onValueChange={setBeneficiaryId}
                placeholder="Select a beneficiary (optional)"
                hint={
                  beneficiaries.beneficiaries.length === 0
                    ? 'You have no saved beneficiaries yet — enter the details below.'
                    : 'Selecting a beneficiary fills the fields below.'
                }
              >
                <Select.Option value="">Enter details manually</Select.Option>
                {beneficiaries.beneficiaries.map((beneficiary) => (
                  <Select.Option key={beneficiary.id} value={beneficiary.id}>
                    {beneficiary.name} — {beneficiary.bankName} ·{' '}
                    {String(beneficiary.accountNumber || '').slice(-4)}
                  </Select.Option>
                ))}
              </Select>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Recipient name"
                  value={form.recipientName}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, recipientName: event.target.value }))
                  }
                  placeholder="e.g. Lucia Mensah"
                />
                <Input
                  label="Bank name"
                  value={form.recipientBank}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, recipientBank: event.target.value }))
                  }
                  placeholder="e.g. Sterling Bank"
                />
                <Input
                  label="Account number"
                  value={form.recipientAccountNumber}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      recipientAccountNumber: event.target.value,
                    }))
                  }
                  placeholder="0123456789"
                  className="sm:col-span-2"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold tracking-tight">How much are you sending?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We will show you the fee and limits before anything is submitted.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-4">
                <Input
                  type="number"
                  inputMode="decimal"
                  label={`Amount (${sender?.currency || 'USD'})`}
                  value={form.amount}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, amount: event.target.value }))
                  }
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  error={insufficient ? 'That is more than the available balance.' : undefined}
                />
                <Input
                  label="Description (optional)"
                  value={form.description}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="e.g. Rent for September"
                />
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Review
                </h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">From</dt>
                    <dd className="text-right font-medium">
                      {sender?.name || '—'}
                      <span className="block text-xs text-muted-foreground">
                        {formatCurrency(sender?.availableBalance ?? 0, sender?.currency || 'USD')}{' '}
                        available
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">To</dt>
                    <dd className="text-right font-medium">
                      {form.recipientName || '—'}
                      <span className="block text-xs text-muted-foreground">
                        {form.recipientBank}
                        {form.recipientAccountNumber
                          ? ` · •••• ${form.recipientAccountNumber.slice(-4)}`
                          : ''}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <dt className="text-muted-foreground">Transfer fee</dt>
                    <dd className="font-medium text-success">Free</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-semibold">Total debit</dt>
                    <dd className="text-lg font-bold">
                      {formatCurrency(amountValue, sender?.currency || 'USD')}
                    </dd>
                  </div>
                </dl>
                {insufficient && (
                  <Alert variant="warning" className="mt-4">
                    <AlertDescription>
                      Reduce the amount or choose another account to continue.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <Button
            variant="ghost"
            onClick={() =>
              step === 1 ? router.push('/accounts') : setStep((current) => current - 1)
            }
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep((current) => current + 1)}
              disabled={!canContinue}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canContinue || isSubmitting}
              isLoading={isSubmitting}
            >
              <Send className="h-4 w-4" />
              Review and send
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm this transfer"
        description="Transfers cannot be reversed once the recipient receives the funds."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              Confirm and send
            </Button>
          </>
        }
      >
        <dl className="space-y-3.5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-lg font-bold">
              {formatCurrency(amountValue, sender?.currency || 'USD')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">To</dt>
            <dd className="text-right font-medium">
              {form.recipientName}
              <span className="block text-xs text-muted-foreground">{form.recipientBank}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-medium">{sender?.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Status after sending</dt>
            <dd>
              <Badge variant="warning">Pending review</Badge>
            </dd>
          </div>
        </dl>
      </Dialog>
    </div>
  );
}

export default function TransferPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-muted-foreground">Loading transfer…</div>
      }
    >
      <TransferPageContent />
    </Suspense>
  );
}
