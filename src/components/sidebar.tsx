'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Bell,
  CreditCard,
  Download,
  HelpCircle,
  Home,
  Landmark,
  PiggyBank,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  Upload,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const APP_NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home },
      { href: '/accounts', label: 'Accounts', icon: Landmark },
      { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Move money',
    items: [
      { href: '/transfer', label: 'Send money', icon: Send },
      { href: '/deposit', label: 'Deposit', icon: Download },
      { href: '/withdraw', label: 'Withdraw', icon: Upload },
      { href: '/beneficiaries', label: 'Beneficiaries', icon: Users },
    ],
  },
  {
    title: 'Grow and protect',
    items: [
      { href: '/cards', label: 'Cards', icon: CreditCard },
      { href: '/loans', label: 'Loans', icon: Landmark },
      { href: '/savings', label: 'Savings goals', icon: PiggyBank },
      { href: '/investments', label: 'Investments', icon: TrendingUp },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/profile', label: 'Profile', icon: User },
      { href: '/kyc', label: 'Verification', icon: ShieldCheck },
      { href: '/support', label: 'Support', icon: HelpCircle },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname() || '/';

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-[2px] lg:hidden',
          open ? 'block' : 'hidden'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-[264px] border-r border-border bg-background transition-transform duration-200 ease-out lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <nav className="flex-1 overflow-y-auto px-3 py-5">
            {APP_NAV_GROUPS.map((group) => (
              <div key={group.title} className="mb-6 last:mb-0">
                <p className="px-3 pb-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={cn(
                            'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                            active
                              ? 'bg-accent font-semibold text-accent-foreground'
                              : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                          aria-current={active ? 'page' : undefined}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-primary" />
                          )}
                          <Icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0',
                              active ? 'text-primary' : 'text-muted-foreground'
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-border p-4">
            <div className="rounded-lg bg-muted/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                Protected 24/7
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Every transfer is screened for fraud and secured with bank-grade
                encryption.
              </p>
              <Link
                href="/support"
                onClick={onClose}
                className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
              >
                Get help
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
