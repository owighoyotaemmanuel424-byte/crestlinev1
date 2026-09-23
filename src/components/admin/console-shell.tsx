'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react';

import { BrandLogo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { ConsoleBadge } from '@/components/admin/admin-ui';
import { ADMIN_RESOURCES } from '@/lib/admin/resources';
import type { ConsoleOperator } from '@/hooks/use-console-session';
import { cn } from '@/lib/utils';

/**
 * Persistent privileged chrome: brand mark, a standing ADMIN badge, the module
 * navigation and the operator identity. Every console route renders inside it.
 */
export function ConsoleShell({
  operator,
  displayName,
  onSignOut,
  children,
}: {
  operator: ConsoleOperator;
  displayName: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const navItems: { href: string; label: string; icon?: LucideIcon }[] = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    ...ADMIN_RESOURCES.map((resource) => ({
      href: `/admin/${resource.slug}`,
      label: resource.label,
    })),
  ];

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-purple-500/20 bg-[#0b0f19]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" aria-label="Crestline Capital operations console">
            <BrandLogo />
          </Link>
          <ConsoleBadge className="hidden sm:inline-flex">
            <ShieldCheck className="h-3 w-3" />
            Admin
          </ConsoleBadge>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-white">{displayName}</p>
              <p className="text-[0.7rem] uppercase tracking-wide text-purple-300">
                {operator.role.replace(/_/g, ' ')}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSignOut}
              className="border-white/15 bg-white/[0.04] text-slate-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>

        <nav
          aria-label="Console modules"
          className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-4 pb-2.5 sm:px-6 lg:px-8"
        >
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors',
                  isActive
                    ? 'border-purple-400/40 bg-purple-500/15 text-white'
                    : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-slate-100'
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

export default ConsoleShell;
