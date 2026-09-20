import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Globe,
  HeartHandshake,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'Crestline Capital is a digital-first bank built around clear pricing, fast payments and bank-grade security.',
};

const VALUES = [
  {
    icon: Scale,
    title: 'Nothing hidden',
    body: 'Fees, limits and rates are shown before you confirm anything. No asterisks, no surprises.',
  },
  {
    icon: ShieldCheck,
    title: 'Security by default',
    body: 'Fraud screening, device approvals and encryption protect every account from day one.',
  },
  {
    icon: HeartHandshake,
    title: 'Humans when it matters',
    body: 'Real people handle disputes, chargebacks and the moments that actually matter.',
  },
  {
    icon: Sparkles,
    title: 'Simple beats clever',
    body: 'If a screen needs explaining, we redesign it. Banking should feel obvious.',
  },
];

const MILESTONES = [
  { year: '2019', title: 'Founded', body: 'Started as a savings product for freelancers and small teams.' },
  { year: '2021', title: 'Full banking licence', body: 'Added checking accounts, cards and lending.' },
  { year: '2023', title: 'Investing launched', body: 'Portfolios and recurring contributions arrived in-app.' },
  { year: '2026', title: 'Business banking', body: 'Approvals, multi-user access and role permissions shipped.' },
];

export default function AboutPage() {
  return (
    <div className="bg-background">
      <section className="chase-navy relative overflow-hidden">
        <div className="chase-grid-lines absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-200">
            About Crestline Capital
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            A bank built around the way people actually move money
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            We started with a simple frustration: opening an account, sending money and
            understanding where it went should not require three phone calls. So we rebuilt the
            whole experience around one dashboard, one login and one clear timeline.
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
              <Link href="/services">Explore our services</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-muted/50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            { value: '1.4M', label: 'Customers served', icon: Building2 },
            { value: '$8.2B', label: 'Processed annually', icon: Globe },
            { value: '99.98%', label: 'Platform uptime', icon: ShieldCheck },
            { value: '4 min', label: 'Average onboarding', icon: Sparkles },
          ].map((stat) => (
            <div key={stat.label} className="flex items-start gap-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                <stat.icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">What we stand for</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Four principles we refuse to compromise on
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {VALUES.map((value) => (
            <div key={value.title} className="chase-card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
                <value.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
                {value.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">Our story</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              From a savings app to a full-service bank
            </h2>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {MILESTONES.map((milestone) => (
              <li key={milestone.year} className="chase-card p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  {milestone.year}
                </p>
                <h3 className="mt-3 text-base font-semibold text-foreground">{milestone.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {milestone.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="chase-blue-band rounded-2xl px-6 py-12 text-center shadow-elevated sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Come and see the difference
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
            Open an account in minutes, or talk to our team if you would rather ask questions
            first.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="navy" className="bg-navy-950 hover:bg-navy-900">
              <Link href="/register">Open an account</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/60 bg-transparent text-white hover:border-white hover:bg-white/15 hover:text-white"
            >
              <Link href="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
