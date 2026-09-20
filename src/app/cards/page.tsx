// src/app/cards/page.tsx
// Debit and credit cards

'use client';

import Link from 'next/link';
import { CreditCard, LifeBuoy, Lock, Snowflake } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { useApiResource } from '@/hooks';
import { cn } from '@/lib/utils';

interface CardRecord {
  id: string;
  cardNumber?: string;
  cardType?: string;
  nameOnCard?: string;
  status?: string;
  isDefault?: boolean;
  expiryMonth?: number;
  expiryYear?: number;
}

function statusVariant(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'success' as const;
    case 'frozen':
    case 'pending':
      return 'warning' as const;
    case 'cancelled':
    case 'blocked':
    case 'expired':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function CardsPage() {
  const { data, isLoading, error, refetch } = useApiResource<CardRecord[]>('/api/cards');

  const cards = Array.isArray(data) ? data : [];
  const active = cards.filter((card) => (card.status || '').toLowerCase() === 'active').length;
  const frozen = cards.filter((card) => (card.status || '').toLowerCase() === 'frozen').length;

  return (
    <div>
      <PageHeader
        eyebrow="Everyday spending"
        title="Cards"
        description="Every card linked to your Crestline accounts, with the controls to lock them down instantly."
        actions={
          <Button asChild variant="outline">
            <Link href="/support">
              <LifeBuoy className="h-4 w-4" />
              Card support
            </Link>
          </Button>
        }
      />

      {cards.length > 0 && (
        <div className="mb-6 grid gap-5 sm:grid-cols-3">
          <StatCard label="Cards on file" value={String(cards.length)} icon={CreditCard} tone="primary" />
          <StatCard label="Active" value={String(active)} icon={Lock} tone="success" />
          <StatCard label="Frozen" value={String(frozen)} icon={Snowflake} tone="warning" />
        </div>
      )}

      {isLoading ? (
        <LoadingRows rows={2} />
      ) : error ? (
        <ErrorState
          title="We could not load your cards"
          description={error}
          action={
            <Button variant="outline" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No cards issued yet"
          description="Cards are issued once your identity check is approved. You can track that from the verification page."
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button asChild>
                <Link href="/kyc">Check verification status</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/support">Request a card</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const digits = String(card.cardNumber || '');
            const gradient = /visa/i.test(card.cardType || '')
              ? 'from-navy-950 via-navy-900 to-primary-700'
              : /master/i.test(card.cardType || '')
                ? 'from-[#0b2f5c] via-[#123c6e] to-[#2a5c9c]'
                : 'from-[#002b5c] via-[#0f66a8] to-[#429ad9]';

            return (
              <div key={card.id} className="chase-card p-6">
                <div
                  className={cn(
                    'relative aspect-[1.6/1] w-full overflow-hidden rounded-xl bg-gradient-to-br p-5 text-white shadow-elevated',
                    gradient
                  )}
                >
                  <div className="chase-grid-lines absolute inset-0 opacity-20" aria-hidden="true" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                        {card.cardType || 'Crestline'}
                      </span>
                      {card.isDefault && (
                        <Badge variant="primary" size="sm">
                          Default
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="font-mono text-lg tracking-[0.18em]">
                        •••• •••• •••• {digits.slice(-4) || '0000'}
                      </p>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/60">
                            Card holder
                          </p>
                          <p className="text-sm font-medium">
                            {card.nameOnCard || 'Account holder'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/60">
                            Expires
                          </p>
                          <p className="text-sm font-medium">
                            {card.expiryMonth && card.expiryYear
                              ? `${String(card.expiryMonth).padStart(2, '0')}/${String(
                                  card.expiryYear
                                ).slice(-2)}`
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <Badge variant={statusVariant(card.status)}>{card.status || 'unknown'}</Badge>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/support">Report a problem</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="chase-card mt-6 p-6">
        <h2 className="text-base font-semibold tracking-tight">Card controls</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Need to stop a card right now? Our team can freeze it in seconds.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { title: 'Lost or stolen', body: 'Report it and we block the card immediately.' },
            { title: 'Suspicious charge', body: 'Open a dispute and we credit you while we investigate.' },
            { title: 'Travel notice', body: 'Let us know before you use the card abroad.' },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
        <Button asChild className="mt-5">
          <Link href="/support">Contact card services</Link>
        </Button>
      </section>
    </div>
  );
}
