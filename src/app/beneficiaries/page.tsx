// src/app/beneficiaries/page.tsx
// Saved beneficiaries

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Send, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useApiMutation, useBeneficiaries, useToast } from '@/hooks';

export default function BeneficiariesPage() {
  const { beneficiaries, total, isLoading, error, refetch } = useBeneficiaries({ limit: 50 });
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
    currency: 'USD',
  });
  const [formError, setFormError] = useState('');

  const verified = beneficiaries.filter((item) => item.isVerified).length;

  const submit = async () => {
    setFormError('');
    if (!form.name.trim() || !form.bankName.trim() || !form.accountNumber.trim()) {
      setFormError('Name, bank and account number are all required.');
      return;
    }

    try {
      await mutate('/api/beneficiaries', 'POST', {
        name: form.name.trim(),
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
        currency: form.currency,
        isDefault: false,
      });
      setOpen(false);
      setForm({ name: '', bankName: '', accountNumber: '', currency: 'USD' });
      refetch();
      success('Beneficiary saved — you can pay them straight from the transfer page.', 'Saved');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save this beneficiary';
      setFormError(message);
      showError(message, 'Not saved');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Payees"
        title="Beneficiaries"
        description="Keep the people and businesses you pay often in one verified list for faster transfers."
        actions={
          <>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add beneficiary
            </Button>
            <Button asChild variant="outline">
              <Link href="/transfer">
                <Send className="h-4 w-4" />
                Send money
              </Link>
            </Button>
          </>
        }
      />

      {!isLoading && !error && beneficiaries.length > 0 && (
        <div className="mb-6 grid gap-5 sm:grid-cols-3">
          <StatCard label="Saved beneficiaries" value={String(total)} icon={Users} tone="primary" />
          <StatCard label="Verified" value={String(verified)} icon={Users} tone="success" />
          <StatCard
            label="Awaiting verification"
            value={String(Math.max(beneficiaries.length - verified, 0))}
            icon={Users}
            tone="warning"
          />
        </div>
      )}

      <section className="chase-card p-6">
        <h2 className="text-base font-semibold tracking-tight">Your payee list</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Verified beneficiaries can be paid without re-entering their account details.
        </p>

        <div className="mt-5">
          {isLoading ? (
            <LoadingRows rows={3} />
          ) : error ? (
            <ErrorState
              title="We could not load your beneficiaries"
              description={error}
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  Try again
                </Button>
              }
            />
          ) : beneficiaries.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No saved beneficiaries"
              description="Add someone you pay regularly and their details will be filled in automatically next time."
              action={<Button onClick={() => setOpen(true)}>Add your first beneficiary</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {beneficiaries.map((beneficiary) => (
                <li
                  key={beneficiary.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {beneficiary.name?.charAt(0)?.toUpperCase() || 'B'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {beneficiary.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {beneficiary.bankName} · ••••{' '}
                        {String(beneficiary.accountNumber || '').slice(-4)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={beneficiary.isVerified ? 'success' : 'warning'}>
                      {beneficiary.isVerified ? 'Verified' : 'Pending'}
                    </Badge>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/transfer?beneficiaryId=${beneficiary.id}`}>Pay</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add a beneficiary"
        description="Double-check the account number — transfers to saved payees cannot be recalled."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isSubmitting}>
              Save beneficiary
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Beneficiary name"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="e.g. Lucia Mensah"
          />
          <Input
            label="Bank name"
            value={form.bankName}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, bankName: event.target.value }))
            }
            placeholder="e.g. Sterling Bank"
          />
          <Input
            label="Account number"
            value={form.accountNumber}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, accountNumber: event.target.value }))
            }
            placeholder="0123456789"
          />
          <Select
            label="Currency"
            value={form.currency}
            onValueChange={(value) => setForm((previous) => ({ ...previous, currency: value }))}
          >
            <Select.Option value="USD">USD — US Dollar</Select.Option>
            <Select.Option value="NGN">NGN — Nigerian Naira</Select.Option>
            <Select.Option value="EUR">EUR — Euro</Select.Option>
            <Select.Option value="GBP">GBP — Pound Sterling</Select.Option>
          </Select>
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
        </div>
      </Dialog>
    </div>
  );
}
