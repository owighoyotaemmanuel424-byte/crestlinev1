// src/app/loans/page.tsx
// Personal loans

'use client';

import { useState } from 'react';
import { Landmark, Percent, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useApiMutation, useApiResource, useToast } from '@/hooks';
import { formatCurrency, toAmount } from '@/lib/utils';

function statusVariant(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'approved':
    case 'active':
    case 'disbursed':
    case 'completed':
      return 'success' as const;
    case 'pending':
    case 'under_review':
    case 'hold':
      return 'warning' as const;
    case 'rejected':
    case 'failed':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function LoansPage() {
  const loans = useApiResource<any[]>('/api/loans');
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', termMonths: '12', purpose: '' });
  const [formError, setFormError] = useState('');

  const rows = Array.isArray(loans.data) ? loans.data : [];
  const outstanding = rows
    .filter((loan) => /active|disbursed|approved/i.test(loan?.status || ''))
    .reduce((sum, loan) => sum + toAmount(loan?.outstandingBalance ?? loan?.amount), 0);
  const currency = rows[0]?.currency || 'USD';

  const submit = async () => {
    setFormError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setFormError('Enter a loan amount greater than zero.');
      return;
    }
    if (!form.purpose.trim()) {
      setFormError('Tell us what the loan is for.');
      return;
    }

    try {
      await mutate('/api/loans', 'POST', {
        amount,
        currency,
        purpose: form.purpose,
        termMonths: Number(form.termMonths),
      });
      setOpen(false);
      setForm({ amount: '', termMonths: '12', purpose: '' });
      loans.refetch();
      success('Application received — our underwriting team will review it.', 'Loan submitted');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Application failed';
      setFormError(message);
      showError(message, 'Could not submit application');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Borrowing"
        title="Loans"
        description="Transparent personal lending with no origination surprises. Track every application and repayment here."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Apply for a loan
          </Button>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 grid gap-5 sm:grid-cols-3">
          <StatCard
            label="Outstanding balance"
            value={formatCurrency(outstanding, currency)}
            icon={Landmark}
            tone="primary"
          />
          <StatCard label="Applications" value={String(rows.length)} icon={Percent} />
          <StatCard
            label="Approved"
            value={String(
              rows.filter((loan) => /approved|disbursed|active/i.test(loan?.status || '')).length
            )}
            icon={Landmark}
            tone="success"
          />
        </div>
      )}

      <section className="chase-card p-6">
        <h2 className="text-base font-semibold tracking-tight">Your applications</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every loan you have applied for, with its current decision status.
        </p>

        <div className="mt-5">
          {loans.isLoading ? (
            <LoadingRows rows={2} />
          ) : loans.error ? (
            <ErrorState
              title="We could not load your loans"
              description={loans.error}
              action={
                <Button variant="outline" onClick={loans.refetch}>
                  Try again
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No loan applications yet"
              description="Apply in a couple of minutes and we will tell you the rate and terms before you commit."
              action={<Button onClick={() => setOpen(true)}>Apply for a loan</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((loan) => (
                <li
                  key={loan.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(loan.amount, loan.currency)} ·{' '}
                      {(loan.loanType || 'Personal').toString().toLowerCase()} loan
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {loan.description || 'No purpose recorded'} ·{' '}
                      {new Date(loan.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <Badge variant={statusVariant(loan.status)}>{loan.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Apply for a personal loan"
        description="We check affordability before approving — no hidden fees, no prepayment penalty."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isSubmitting}>
              Submit application
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            type="number"
            inputMode="decimal"
            label={`Amount (${currency})`}
            value={form.amount}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, amount: event.target.value }))
            }
            placeholder="5000"
            min="0"
          />
          <Select
            label="Repayment term"
            value={form.termMonths}
            onValueChange={(value) => setForm((previous) => ({ ...previous, termMonths: value }))}
          >
            <Select.Option value="6">6 months</Select.Option>
            <Select.Option value="12">12 months</Select.Option>
            <Select.Option value="24">24 months</Select.Option>
            <Select.Option value="36">36 months</Select.Option>
            <Select.Option value="60">60 months</Select.Option>
          </Select>
          <Input
            label="What is the loan for?"
            value={form.purpose}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, purpose: event.target.value }))
            }
            placeholder="e.g. Home renovation"
          />
          {formError && (
            <p className="text-sm font-medium text-destructive">{formError}</p>
          )}
          <p className="rounded-lg bg-muted p-3.5 text-xs leading-relaxed text-muted-foreground">
            By submitting you agree that we may run affordability, identity and credit checks.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
