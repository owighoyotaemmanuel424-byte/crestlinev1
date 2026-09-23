'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand';
import { Sidebar } from '@/components/sidebar';
import { cn } from '@/lib/utils';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password'];
const MARKETING_ROUTES = ['/', '/about', '/services', '/contact'];

const MARKETING_NAV = [
  { label: 'Personal', href: '/' },
  { label: 'Services', href: '/services' },
  { label: 'About us', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const WORKSPACE_QUICK_NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Accounts', href: '/accounts' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Send money', href: '/transfer' },
  { label: 'Cards', href: '/cards' },
];

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Banking',
    links: [
      { label: 'Checking and savings', href: '/services' },
      { label: 'Credit cards', href: '/services' },
      { label: 'Loans', href: '/services' },
      { label: 'Investing', href: '/services' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Security', href: '/about' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Open an account', href: '/register' },
      { label: 'Sign in', href: '/login' },
      { label: 'Explore services', href: '/services' },
    ],
  },
];

export interface ShellUser {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  name?: string;
}

function base64UrlDecode(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readTokenClaims(token: string): { sub?: string; email?: string; role?: string } | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    return JSON.parse(base64UrlDecode(segment));
  } catch {
    return null;
  }
}

function initialsFor(user: ShellUser | null): string {
  const first = user?.firstName?.[0];
  const last = user?.lastName?.[0];
  if (first && last) return (first + last).toUpperCase();
  const source = user?.name || user?.email || '';
  const [a, b] = source.split(/[\s@.]+/).filter(Boolean);
  if (a && b) return (a[0] + b[0]).toUpperCase();
  return (a?.[0] || 'C').toUpperCase();
}

function displayName(user: ShellUser | null): string {
  if (user?.firstName) return `${user.firstName} ${user.lastName || ''}`.trim();
  if (user?.name) return user.name;
  if (user?.email) return user.email.split('@')[0];
  return 'Your account';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const [user, setUser] = useState<ShellUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isMarketing = MARKETING_ROUTES.includes(pathname);
  // Admin routes render their own privileged chrome and enforce their own
  // session rules, so the customer shell stays out of the way entirely.
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isWorkspace = !isAuthRoute && !isMarketing && !isAdminRoute;

  // Load the signed-in identity whenever the route changes.
  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    setMenuOpen(false);
    setNavOpen(false);

    const load = async () => {
      const token =
        typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;

      if (!token) {
        if (!cancelled) {
          setUser(null);
          setChecked(true);
        }
        return;
      }

      try {
        const response = await fetch('/api/profile', {
          headers: { Authorization: 'Bearer ' + token },
        });

        if (response.status === 401) {
          window.localStorage.removeItem('token');
          if (!cancelled) {
            setUser(null);
            setChecked(true);
          }
          return;
        }

        if (response.ok) {
          const payload = await response.json();
          const data = payload?.data ?? payload;
          if (!cancelled) {
            setUser({
              id: data?.id,
              firstName: data?.firstName,
              lastName: data?.lastName,
              email: data?.email,
              role: data?.role,
              name: data?.name,
            });
            setChecked(true);
          }
          return;
        }
      } catch {
        // Fall through to the token claims below.
      }

      // The session exists even when the profile endpoint is unavailable.
      const claims = readTokenClaims(token);
      if (!cancelled) {
        setUser(
          claims
            ? { id: claims.sub, email: claims.email, role: claims.role }
            : {}
        );
        setChecked(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Send signed-out visitors to the sign-in page, and signed-in visitors away
  // from the auth screens.
  useEffect(() => {
    if (!checked) return;
    if (isWorkspace && !user) {
      router.replace('/login?returnTo=' + encodeURIComponent(pathname));
      return;
    }
    if (isAuthRoute && user) {
      router.replace('/dashboard');
    }
  }, [checked, isAuthRoute, isWorkspace, user, pathname, router]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignOut = useCallback(async () => {
    const token =
      typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      });
    } catch {
      // Ignore network errors — the local session is cleared regardless.
    }
    window.localStorage.removeItem('token');
    setUser(null);
    setMenuOpen(false);
    router.replace('/login');
  }, [router]);

  if (isAuthRoute || isAdminRoute) {
    return <>{children}</>;
  }

  if (isMarketing) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="chase-navy sticky top-0 z-50 shadow-header">
          <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
            <Link href="/" aria-label="Crestline Capital home">
              <BrandLogo />
            </Link>

            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
              {MARKETING_NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      'rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-white/12 text-white'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/login"
                className="rounded-md border border-white/35 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:bg-primary-50"
              >
                Open an account
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="chase-navy mt-auto">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
              <div>
                <BrandLogo />
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
                  Everyday banking, lending and investing in one secure place —
                  built for people who want their money to move as fast as they do.
                </p>
              </div>
              {FOOTER_COLUMNS.map((column) => (
                <div key={column.title}>
                  <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                  <ul className="mt-4 space-y-2.5">
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm text-white/70 transition-colors hover:text-white"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-12 flex flex-col gap-3 border-t border-white/12 pt-6 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
              <p>
                &copy; {new Date().getFullYear()} Crestline Capital. All rights reserved.
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Member FDIC</span>
                <span aria-hidden="true">·</span>
                <span>Equal Housing Lender</span>
                <span aria-hidden="true">·</span>
                <span>Sandbox demo environment</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="chase-navy fixed inset-x-0 top-0 z-50 h-16 shadow-header">
        <div className="flex h-full items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-md p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/dashboard" aria-label="Crestline Capital dashboard">
            <BrandLogo />
          </Link>

          <nav
            className="ml-6 hidden items-center gap-1 xl:flex"
            aria-label="Primary"
          >
            {WORKSPACE_QUICK_NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-white/14 text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/notifications"
              className="rounded-md p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
            </Link>

            <Link
              href="/support"
              className="hidden rounded-md p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white sm:block"
              aria-label="Support"
            >
              <HelpCircle className="h-[18px] w-[18px]" />
            </Link>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-md py-1.5 pl-1.5 pr-2 transition-colors hover:bg-white/10"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[0.8rem] font-bold text-white ring-2 ring-white/25">
                  {initialsFor(user)}
                </span>
                <span className="hidden text-left md:block">
                  <span className="block max-w-[9rem] truncate text-sm font-medium leading-tight text-white">
                    {displayName(user)}
                  </span>
                  <span className="block text-[0.7rem] uppercase tracking-wide text-white/60">
                    {user?.role || 'Customer'}
                  </span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-white/70 md:block" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 animate-fade-in overflow-hidden rounded-lg border border-border bg-popover py-1.5 shadow-elevated"
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {displayName(user)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user?.email || 'Signed in'}
                    </p>
                  </div>
                  <MenuLink href="/profile" icon={User} label="Profile" />
                  <MenuLink href="/kyc" icon={ShieldCheck} label="Verification" />
                  <MenuLink href="/settings" icon={Settings} label="Settings" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="pt-16 lg:pl-[264px]">
        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {navOpen && (
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          className="fixed bottom-5 right-5 z-50 rounded-full bg-navy-900 p-3 text-white shadow-elevated lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </Link>
  );
}
