import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  CheckCircle2,
  CreditCard,
  Landmark,
  LineChart,
  PiggyBank,
  Send,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Checking, savings, cards, loans, investing and business banking from Crestline Capital — see what each account includes.',
};

const SERVICES = [
  {
    id: 'checking',
    icon: Landmark,
    name: 'Everyday checking',
    tagline: 'Your day-to-day account with no monthly fee.',
    features: [
      'No minimum balance and no monthly service fee',
      'Instant card notifications for every payment',
      'Free transfers to saved beneficiaries',
      'Statements and receipts available any time',
    ],
  },
  {
    id: 'savings',
    icon: PiggyBank,
    name: 'High-yield savings',
    tagline: 'Goals that fill themselves.',
    features: [
      'Competitive variable rate paid monthly',
      'Named goals with progress tracking',
      'Automatic recurring contributions',
      'Withdraw any time without penalty',
    ],
  },
  {
    id: 'cards',
    icon: CreditCard,
    name: 'Debit and credit cards',
    tagline: 'Spend with control, not surprises.',
    features: [
      'Freeze or report a card in seconds',
      'Zero foreign transaction fees on debit',
      'Categorised spend in your dashboard',
      'Disputes handled by real people',
    ],
  },
  {
    id: 'loans',
    icon: Banknote,
    name: 'Personal loans',
    tagline: 'Know the total cost before you sign.',
    features: [
      'No origination fee and no prepayment penalty',
      'Terms from 6 to 60 months',
      'Affordability decision within one business day',
      'Repayments tracked alongside your accounts',
    ],
  },
  {
    id: 'investing',
    icon: LineChart,
    name: 'Investing',
    tagline: 'Build portfolios next to your everyday money.',
    features: [
      'Multiple portfolios for different goals',
      'Track contributions and performance in one view',
      'Fund directly from checking or savings',
      'Clear risk information, always visible',
    ],
  },
  {
    id: 'business',
    icon: Briefcase,
    name: 'Business banking',
    tagline: 'Built for teams that move money together.',
    features: [
      'Multi-user access with role permissions',
      'Payment approvals and audit trails',
      'Bulk transfers to saved beneficiaries',
      'Dedicated onboarding specialist',
    ],
  },
];

const TIERS = [
  {
    name: 'Everyday',
    price: '$0',
    period: 'per month',
    description: 'For personal banking without the fees.',
    features: ['1 checking account', 'Free transfers', 'Card controls', 'Email support'],
    highlight: false,
  },
  {
    name: 'Crestline Plus',
    price: '$12',
    period: 'per month',
    description: 'For households managing several goals.',
    features: [
      'Unlimited savings goals',
      'Priority phone support',
      'Higher transfer limits',
      'Fee-free withdrawals abroad',
    ],
    highlight: true,
  },
  {
    name: 'Business',
    price: 'From $29',
    period: 'per month',
    description: 'For companies with payment approvals.',
    features: [
      'Multi-user roles',
      'Approval workflows',
      'Bulk payments',
      'Named account manager',
    ],
    highlight: false,
  },
];

export default function ServicesPage() {
  return (
    <div className="bg-background">
      <section className="chase-navy relative overflow-hidden">
        <div className="chase-grid-lines absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-200">
            Products and services
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            Everything you need to bank, borrow and invest
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            Each product lives in the same dashboard, shares the same security model and reports
            into the same transaction timeline.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/register">
                Open an account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          {SERVICES.map((service) => (
            <article
              key={service.id}
              id={service.id}
              className="chase-card chase-card-hover scroll-mt-24 p-7"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
                <service.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
                {service.name}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{service.tagline}</p>
              <ul className="mt-5 space-y-3">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Simple plans, no hidden line items
            </h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={
                  'chase-card flex flex-col p-7 ' +
                  (tier.highlight ? 'border-primary/40 ring-1 ring-primary/20' : '')
                }
              >
                {tier.highlight && (
                  <span className="mb-4 inline-flex w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {tier.name}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-7" variant={tier.highlight ? 'default' : 'outline'}>
                  <Link href="/register">
                    Get started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Included with every account</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              The safety net that comes as standard
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Fraud monitoring, device approvals, encrypted storage and a full audit trail are not
              add-ons. They ship with every account, personal or business.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Real-time transaction screening',
                'Instant account and card freezing',
                'Deposit protection up to the insured limit',
                'Support 24/7 for lost cards and fraud',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="chase-navy relative overflow-hidden rounded-2xl p-8 text-white shadow-elevated">
            <div className="chase-grid-lines absolute inset-0 opacity-25" aria-hidden="true" />
            <div className="relative">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/12">
                <Send className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">Ready to move your money?</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/75">
                Open an account now and your dashboard, cards and savings goals are ready in the
                same session.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link href="/register">Open an account</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/contact">Talk to sales</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
