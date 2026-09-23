import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Briefcase,
  Building2,
  CheckCircle2,
  CreditCard,
  Fingerprint,
  Landmark,
  LineChart,
  Lock,
  PiggyBank,
  Quote,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Crestline Capital | Banking that keeps up with your life',
  description:
    'Open a Crestline Capital account in minutes. Everyday checking, high-yield savings, cards, loans and investing — all in one secure app.',
};

const PRODUCTS = [
  {
    icon: Landmark,
    title: 'Everyday checking',
    description:
      'No monthly service fee, no minimum balance and instant notifications on every card payment.',
    href: '/services',
  },
  {
    icon: PiggyBank,
    title: 'High-yield savings',
    description:
      'Set a goal, automate the deposits and watch your balance grow with competitive rates.',
    href: '/services',
  },
  {
    icon: CreditCard,
    title: 'Credit cards',
    description:
      'Freeze a card, report it lost and review spend by category straight from your dashboard.',
    href: '/services',
  },
  {
    icon: Banknote,
    title: 'Personal loans',
    description:
      'Transparent terms with no hidden origination fees, reviewed by real underwriters.',
    href: '/services',
  },
  {
    icon: LineChart,
    title: 'Investing',
    description:
      'Build portfolios across cash, funds and bonds with performance tracked in one place.',
    href: '/services',
  },
  {
    icon: Briefcase,
    title: 'Business banking',
    description:
      'Multi-user access, role-based permissions and payment approvals built for teams.',
    href: '/services',
  },
];

const FEATURES = [
  {
    icon: Send,
    title: 'Send money in seconds',
    description:
      'Pay a saved beneficiary or a brand-new account in three steps. Every transfer runs through fraud screening before it leaves.',
    points: [
      'Saved beneficiaries with verified account details',
      'Live status from pending to completed',
      'Fee and limit shown before you confirm',
    ],
  },
  {
    icon: LineChart,
    title: 'See every dollar move',
    description:
      'A single timeline for deposits, withdrawals, card spend and transfers — filterable by account, type or date.',
    points: [
      'Categorised transaction history',
      'Searchable references and receipts',
      'Downloadable statements for your records',
    ],
  },
  {
    icon: Smartphone,
    title: 'Bank on any screen',
    description:
      'The whole workspace is responsive, keyboard friendly and loads fast on a phone, tablet or desktop.',
    points: [
      'Works offline-tolerant with optimistic feedback',
      'Accessible forms with clear error states',
      'Dark navy chrome that stays out of the way',
    ],
  },
];

const SECURITY = [
  {
    icon: ShieldCheck,
    title: 'Fraud monitoring around the clock',
    description:
      'Every transaction is scored in real time and suspicious activity is escalated automatically.',
  },
  {
    icon: Lock,
    title: 'Bank-grade encryption',
    description:
      'Credentials are hashed with bcrypt and traffic is protected end to end. Sensitive values are always masked.',
  },
  {
    icon: Fingerprint,
    title: 'You stay in control',
    description:
      'Freeze accounts and cards instantly, manage beneficiary lists and review your session history.',
  },
];

const STEPS = [
  {
    title: 'Open your account',
    description: 'Tell us who you are and we will set up your profile in under five minutes.',
  },
  {
    title: 'Verify your identity',
    description: 'Upload your ID once and our compliance team reviews it the same day.',
  },
  {
    title: 'Move your money',
    description: 'Deposit, transfer, save and invest — all from the same dashboard.',
  },
];

const TESTIMONIALS = [
  {
    quote:
      'I moved my everyday spending here and the balance is finally easy to understand. Transfers land instantly.',
    name: 'Amara Okafor',
    role: 'Freelance designer',
  },
  {
    quote:
      'The approvals workflow means my team can request payments without giving everyone the keys to the account.',
    name: 'Daniel Reyes',
    role: 'Founder, Northwind Studio',
  },
  {
    quote:
      'Freezing my card the moment I lost it took two taps. The replacement arrived within a week.',
    name: 'Priya Raman',
    role: 'Product manager',
  },
];

export default function HomePage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="chase-navy relative overflow-hidden">
        <div className="chase-grid-lines absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24 lg:px-8">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
              <Zap className="h-3.5 w-3.5 text-primary-200" />
              Personal and business banking in one place
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              Banking that keeps up with your life
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">
              Checking, savings, cards, loans and investing from Crestline Capital —
              one secure login, no hidden fees, and a dashboard that makes your money
              easy to understand.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Open an account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Sign in to online banking</Link>
              </Button>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/15 pt-6">
              {[
                { value: '4 min', label: 'Average sign-up' },
                { value: '0', label: 'Monthly service fees' },
                { value: '24/7', label: 'Fraud monitoring' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xl font-bold text-white sm:text-2xl">{item.value}</dt>
                  <dd className="mt-1 text-xs leading-snug text-white/65">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Product visual */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="relative mx-auto max-w-md">
              <div className="rounded-2xl bg-white p-6 shadow-elevated">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Total balance
                    </p>
                    <p className="mt-1.5 text-3xl font-bold tracking-tight text-navy-900">
                      $24,318.56
                    </p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
                    <Landmark className="h-5 w-5" />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    { icon: Send, label: 'Send' },
                    { icon: Banknote, label: 'Deposit' },
                    { icon: CreditCard, label: 'Cards' },
                  ].map((action) => (
                    <div
                      key={action.label}
                      className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/50 py-3"
                    >
                      <action.icon className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        {action.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-4">
                  {[
                    { label: 'Payroll deposit', meta: 'Checking · 4417', amount: '+ $4,250.00', positive: true },
                    { label: 'Electricity utility', meta: 'Card · 8821', amount: '- $128.40', positive: false },
                    { label: 'Savings transfer', meta: 'Goal · Rainy day', amount: '- $500.00', positive: false },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                        <p className="text-xs text-muted-foreground">{row.meta}</p>
                      </div>
                      <span
                        className={
                          'shrink-0 text-sm font-semibold ' +
                          (row.positive ? 'text-success' : 'text-foreground')
                        }
                      >
                        {row.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="absolute -bottom-6 -left-4 hidden items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-elevated sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-success">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-foreground">Transfer completed</p>
                  <p className="text-[0.7rem] text-muted-foreground">Reference TRF-8F2A19</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border bg-muted/50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:px-6 lg:px-8">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Member FDIC
          </span>
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> 256-bit encryption
          </span>
          <span className="flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" /> 4.9 average app rating
          </span>
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> 190 countries supported
          </span>
        </div>
      </section>

      {/* Products */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24 lg:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow">What we offer</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            One bank for the money you spend, save and grow
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Each product shares the same account, the same security model and the same
            timeline of transactions — so nothing ever falls between the cracks.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => (
            <Link
              key={product.title}
              href={product.href}
              className="chase-card chase-card-hover group flex flex-col p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
                <product.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
                {product.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                Learn more
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Feature rows */}
      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-7xl space-y-16 px-4 py-16 sm:px-6 lg:py-24 lg:px-8">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="grid items-center gap-10 lg:grid-cols-2"
            >
              <div className={index % 2 === 1 ? 'lg:order-2' : undefined}>
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
                <ul className="mt-6 space-y-3">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={index % 2 === 1 ? 'lg:order-1' : undefined}>
                <div className="rounded-2xl border border-border bg-white p-6 shadow-card">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {index === 0 ? 'New transfer' : index === 1 ? 'This month' : 'Activity'}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {index === 0
                          ? '$1,250.00 to Lucia Mensah'
                          : index === 1
                            ? 'Spending by category'
                            : 'Security and access'}
                      </p>
                    </div>
                    <span
                      className={
                        'rounded-full px-3 py-1 text-xs font-semibold ' +
                        (index === 0
                          ? 'bg-warning/10 text-warning'
                          : 'bg-success/10 text-success')
                      }
                    >
                      {index === 0 ? 'Pending review' : 'Up to date'}
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {(index === 0
                      ? [
                          { label: 'From', value: 'Everyday checking · 4417' },
                          { label: 'To', value: 'Lucia Mensah · Sterling Bank' },
                          { label: 'Fee', value: '$0.00' },
                        ]
                      : index === 1
                        ? [
                            { label: 'Groceries', value: '$412.18', width: '72%' },
                            { label: 'Transport', value: '$186.40', width: '44%' },
                            { label: 'Utilities', value: '$240.00', width: '56%' },
                          ]
                        : [
                            { label: 'Two-factor sign-in', value: 'Enabled' },
                            { label: 'Device approvals', value: '2 devices' },
                            { label: 'Last review', value: 'Today, 09:14' },
                          ]
                    ).map((row) =>
                      'width' in row ? (
                        <div key={row.label}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">{row.label}</span>
                            <span className="font-semibold text-foreground">{row.value}</span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: row.width }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div key={row.label} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-medium text-foreground">{row.value}</span>
                        </div>
                      )
                    )}
                  </div>

                  {index === 0 && (
                    <div className="mt-6 flex gap-3">
                      <Button className="flex-1">Confirm transfer</Button>
                      <Button variant="outline" className="flex-1">
                        Review later
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="chase-navy relative overflow-hidden">
        <div className="chase-grid-lines absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-200">
              Security first
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Your money is guarded, not just stored
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Crestline Capital pairs automated fraud detection with the controls you
              expect from a modern bank — plus the audit trail our compliance team
              reviews every day.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {SECURITY.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-sm"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/12 text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24 lg:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow">Getting started</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Three steps to your new account
          </h2>
        </div>

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="chase-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Testimonials */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow">Customer stories</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Trusted by people who move fast
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <figure key={testimonial.name} className="chase-card flex flex-col p-6">
                <Quote className="h-6 w-6 text-primary/40" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className="mt-5 border-t border-border pt-4">
                  <p className="text-sm font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20 lg:px-8">
        <div className="chase-blue-band overflow-hidden rounded-2xl px-6 py-12 text-center shadow-elevated sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready when you are
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
            Open a Crestline Capital account today and get your dashboard, cards and
            savings goals set up in one sitting.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="navy" className="bg-navy-950 hover:bg-navy-900">
              <Link href="/register">
                Open an account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/60 bg-transparent text-white hover:border-white hover:bg-white/15 hover:text-white"
            >
              <Link href="/login">I already bank here</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="chase-navy">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm font-semibold text-white">Crestline Capital</p>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
                Personal and business banking on a ledger you can audit, with human
                underwriters and round-the-clock fraud monitoring.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Products
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-white/80">
                <li>
                  <Link className="transition-colors hover:text-white" href="/services">
                    All products
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-white" href="/savings">
                    Savings goals
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-white" href="/loans">
                    Loans
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-white" href="/investments">
                    Investing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Your account
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-white/80">
                <li>
                  <Link className="transition-colors hover:text-white" href="/login">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-white" href="/register">
                    Open an account
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-white" href="/support">
                    Support
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-white" href="/about">
                    About us
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Operations
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-white/80">
                <li>
                  <Link
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                    href="/admin/login"
                  >
                    <Fingerprint className="h-3.5 w-3.5" />
                    Operations console
                  </Link>
                </li>
              </ul>
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-white/55">
                Privileged staff access only. Console sessions are separate from
                customer banking sessions and every action is audit-logged.
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-white/15 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Crestline Capital. Member FDIC. Equal Housing Lender.</p>
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              256-bit encryption · SOC 2 Type II · ISO 27001
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
