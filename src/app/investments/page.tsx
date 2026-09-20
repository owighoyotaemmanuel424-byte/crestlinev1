// src/app/investments/page.tsx
// Investment portfolios

'use client';

import { useState } from 'react';
import { LineChart, Plus, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { useApiMutation, useApiResource, useToast } from '@/hooks';
import { formatCurrency, toAmount } from '@/lib/utils';

export default function InvestmentsPage() {
  const portfolios = useApiResource<any[]>('/api/investments/portfolios');
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState('');

  const rows = Array.isArray(portfolios.data) ? portfolios.data : [];
  const currency = rows[0]?.currency || 'USD';
  const totalValue = rows.reduce(
    (sum, portfolio) => sum + toAmount(portfolio?.totalValue ?? portfolio?.balance ?? portfolio?.value),
    0
  );

  const submit = async () => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Give your portfolio a name.');
      return;
    }

    try {
      await mutate('/api/investments/portfolios', 'POST', {
        name: form.name,
        description: form.description || undefined,
      });
      setOpen(false);
      setForm({ name: '', description: '' });
      portfolios.refetch();
      success('Portfolio created and ready for funding.', 'Portfolio opened');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not create the portfolio';
      setFormError(message);
      showError(message, 'Portfolio not created');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Wealth"
        title="Investments"
        description="Build diversified portfolios and follow performance without leaving your banking dashboard."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New portfolio
          </Button>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 grid gap-5 sm:grid-cols-3">
          <StatCard
            label="Portfolio value"
            value={formatCurrency(totalValue, currency)}
            icon={LineChart}
            tone="primary"
          />
          <StatCard label="Portfolios" value={String(rows.length)} icon={TrendingUp} />
          <StatCard
            label="Open positions"
            value={String(
              rows.reduce((sum, portfolio) => sum + (portfolio?._count?.positions ?? 0), 0)
            )}
            icon={TrendingUp}
            tone="success"
          />
        </div>
      )}

      <section className="chase-card p-6">
        <h2 className="text-base font-semibold tracking-tight">Your portfolios</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Each portfolio groups the holdings you choose to track together.
        </p>

        <div className="mt-5">
          {portfolios.isLoading ? (
            <LoadingRows rows={2} />
          ) : portfolios.error ? (
            <ErrorState
              title="We could not load your portfolios"
              description={portfolios.error}
              action={
                <Button variant="outline" onClick={portfolios.refetch}>
                  Try again
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No portfolios yet"
              description="Create your first portfolio to start tracking holdings, contributions and returns."
              action={<Button onClick={() => setOpen(true)}>Create a portfolio</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((portfolio) => (
                <li key={portfolio.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{portfolio.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {portfolio.description || 'No description added'}
                    </p>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className="text-right">
                      <span className="block text-sm font-semibold">
                        {formatCurrency(
                          toAmount(portfolio?.totalValue ?? portfolio?.balance ?? portfolio?.value),
                          portfolio.currency || currency
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {portfolio._count?.positions ?? 0} positions
                      </span>
                    </span>
                    <Badge variant={portfolio.status === 'ACTIVE' ? 'success' : 'primary'}>
                      {portfolio.status || 'active'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="chase-card mt-6 p-6">
        <h2 className="text-base font-semibold tracking-tight">How investing works here</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: 'Fund from any account',
              body: 'Move money from checking or savings in a couple of taps.',
            },
            {
              title: 'Diversify as you go',
              body: 'Blend cash, funds and bonds across multiple portfolios.',
            },
            {
              title: 'Track it in one place',
              body: 'Contributions and performance appear next to your bank activity.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Open a portfolio"
        description="Give it a name now — you can add holdings right after."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isSubmitting}>
              Create portfolio
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Portfolio name"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="e.g. Long-term growth"
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, description: event.target.value }))
            }
            placeholder="What is this portfolio for?"
          />
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          <p className="rounded-lg bg-muted p-3.5 text-xs leading-relaxed text-muted-foreground">
            Investments carry risk and values can fall as well as rise. This sandbox build does
            not execute real trades.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
