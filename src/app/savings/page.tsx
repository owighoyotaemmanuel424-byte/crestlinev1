// src/app/savings/page.tsx
// Savings goals

'use client';

import { useState } from 'react';
import { PiggyBank, Plus, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { useApiMutation, useApiResource, useToast } from '@/hooks';
import { formatCurrency, toAmount } from '@/lib/utils';

function progressFor(goal: any) {
  const target = toAmount(goal?.targetAmount);
  const current = toAmount(goal?.currentAmount ?? goal?.balance);
  if (!target) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export default function SavingsPage() {
  const goals = useApiResource<any[]>('/api/savings/goals');
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', targetAmount: '', description: '' });
  const [formError, setFormError] = useState('');

  const rows = Array.isArray(goals.data) ? goals.data : [];
  const currency = rows[0]?.currency || 'USD';
  const totalSaved = rows.reduce(
    (sum, goal) => sum + toAmount(goal?.currentAmount ?? goal?.balance),
    0
  );
  const totalTarget = rows.reduce((sum, goal) => sum + toAmount(goal?.targetAmount), 0);

  const submit = async () => {
    setFormError('');
    const target = Number(form.targetAmount);
    if (!form.name.trim()) {
      setFormError('Give your goal a name.');
      return;
    }
    if (!target || target <= 0) {
      setFormError('Set a target amount greater than zero.');
      return;
    }

    try {
      await mutate('/api/savings/goals', 'POST', {
        name: form.name,
        description: form.description || undefined,
        targetAmount: target,
      });
      setOpen(false);
      setForm({ name: '', targetAmount: '', description: '' });
      goals.refetch();
      success('Your new savings goal is ready.', 'Goal created');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not create the goal';
      setFormError(message);
      showError(message, 'Goal not created');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Grow your money"
        title="Savings goals"
        description="Give every naira or dollar a job. Track progress automatically as you contribute."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 grid gap-5 sm:grid-cols-3">
          <StatCard
            label="Saved so far"
            value={formatCurrency(totalSaved, currency)}
            icon={PiggyBank}
            tone="success"
          />
          <StatCard
            label="Combined target"
            value={formatCurrency(totalTarget, currency)}
            icon={Target}
            tone="primary"
          />
          <StatCard label="Active goals" value={String(rows.length)} icon={Target} />
        </div>
      )}

      {goals.isLoading ? (
        <LoadingRows rows={3} />
      ) : goals.error ? (
        <ErrorState
          title="We could not load your savings goals"
          description={goals.error}
          action={
            <Button variant="outline" onClick={goals.refetch}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No savings goals yet"
          description="Create a goal for an emergency fund, a holiday or a deposit — then watch the progress bar fill up."
          action={<Button onClick={() => setOpen(true)}>Create your first goal</Button>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {rows.map((goal) => {
            const progress = progressFor(goal);
            const current = toAmount(goal?.currentAmount ?? goal?.balance);
            const target = toAmount(goal?.targetAmount);
            return (
              <div key={goal.id} className="chase-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold tracking-tight">
                      {goal.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {goal.description || 'No description added'}
                    </p>
                  </div>
                  <Badge variant={goal.status === 'COMPLETED' ? 'success' : 'primary'}>
                    {goal.status || 'active'}
                  </Badge>
                </div>

                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">
                      {formatCurrency(current, goal.currency || currency)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      of {formatCurrency(target, goal.currency || currency)} target
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{progress}%</span>
                </div>

                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  {goal.targetDate
                    ? `Target date ${new Date(goal.targetDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}`
                    : 'No target date set'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create a savings goal"
        description="Name it, set a target and we will track contributions from your accounts."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isSubmitting}>
              Create goal
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Goal name"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="e.g. Emergency fund"
          />
          <Input
            type="number"
            inputMode="decimal"
            label={`Target amount (${currency})`}
            value={form.targetAmount}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, targetAmount: event.target.value }))
            }
            placeholder="10000"
            min="0"
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, description: event.target.value }))
            }
            placeholder="Three months of expenses"
          />
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
        </div>
      </Dialog>
    </div>
  );
}
