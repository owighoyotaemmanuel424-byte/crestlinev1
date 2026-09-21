import Link from 'next/link';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { type ReactNode } from 'react';

import { BrandLogo } from '@/components/brand';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  highlights,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  highlights?: string[];
}) {
  const points = highlights ?? [
    'No monthly service fees, ever',
    'Instant transfers with fraud screening',
    'Cards, savings goals and investing together',
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
      <div className="order-2 flex flex-col bg-background lg:order-1">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Crestline Capital home">
            <BrandLogo tone="dark" />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[27rem] animate-fade-up">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
            <div className="mt-7">{children}</div>
            {footer && (
              <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
            )}
          </div>
        </main>

        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-5 text-xs text-muted-foreground sm:px-8">
          <span>Member FDIC</span>
          <span aria-hidden="true">·</span>
          <span>Equal Housing Lender</span>
          <span aria-hidden="true">·</span>
          <span>Sandbox environment</span>
        </footer>
      </div>

      <aside className="chase-navy relative order-1 hidden overflow-hidden lg:order-2 lg:flex lg:flex-col lg:justify-center lg:px-12">
        <div className="chase-grid-lines absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
            <ShieldCheck className="h-3.5 w-3.5 text-primary-200" />
            Secure online banking
          </span>
          <h2 className="mt-6 max-w-sm text-3xl font-bold leading-tight tracking-tight text-white">
            Everything your money does, in one place
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Crestline Capital brings your accounts, payments, cards and investments into
            a single dashboard protected by bank-grade security.
          </p>

          <ul className="mt-8 space-y-3.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-white/85">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-200" />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-10 rounded-xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-200">
              Already a customer?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Sign in to see balances, move money and manage every card you hold with us.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
