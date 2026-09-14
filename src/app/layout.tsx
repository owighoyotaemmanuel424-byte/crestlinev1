'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          setUser(data.user || null);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.crestline-user-menu')) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut({ redirectTo: '/login' });
  };

  const isAdminRoute = pathname?.startsWith('/admin');
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isPublicRoute = ['/', '/about', '/contact', '/security', '/privacy', '/terms', '/help', '/faq', '/services'].includes(pathname || '');

  const shouldShowSidebar = !isAuthRoute && !isPublicRoute && user;

  const customerNavItems = [
    { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
    { label: 'Accounts', href: '/accounts', icon: '💰' },
    { label: 'Transactions', href: '/transactions', icon: '📊' },
    { label: 'Transfer', href: '/transfer', icon: '🔄' },
    { label: 'Deposit', href: '/deposit', icon: '📥' },
    { label: 'Withdraw', href: '/withdraw', icon: '📤' },
    { label: 'Cards', href: '/cards', icon: '💳' },
    { label: 'Beneficiaries', href: '/beneficiaries', icon: '👥' },
    { label: 'Loans', href: '/loans', icon: '🏦' },
    { label: 'Investments', href: '/investments', icon: '📈' },
    { label: 'Savings', href: '/savings', icon: '🏷️' },
    { label: 'KYC', href: '/kyc', icon: '🛡️' },
    { label: 'Support', href: '/support', icon: '❓' },
    { label: 'Notifications', href: '/notifications', icon: '🔔' },
    { label: 'Profile', href: '/profile', icon: '👤' },
    { label: 'Settings', href: '/settings', icon: '⚙️' },
  ];

  const adminNavItems = [
    { label: 'Dashboard', href: '/admin', icon: '🏠' },
    { label: 'Customers', href: '/admin/customers', icon: '👥' },
    { label: 'Accounts', href: '/admin/accounts', icon: '💰' },
    { label: 'Transactions', href: '/admin/transactions', icon: '📊' },
    { label: 'Transfers', href: '/admin/transfers', icon: '🔄' },
    { label: 'Deposits', href: '/admin/deposits', icon: '📥' },
    { label: 'Withdrawals', href: '/admin/withdrawals', icon: '📤' },
    { label: 'Cards', href: '/admin/cards', icon: '💳' },
    { label: 'Loans', href: '/admin/loans', icon: '🏦' },
    { label: 'Investments', href: '/admin/investments', icon: '📈' },
    { label: 'Savings', href: '/admin/savings', icon: '🏷️' },
    { label: 'KYC', href: '/admin/kyc', icon: '🛡️' },
    { label: 'AML', href: '/admin/aml', icon: '🔍' },
    { label: 'Fraud', href: '/admin/fraud', icon: '🚨' },
    { label: 'Audit', href: '/admin/audit', icon: '📋' },
    { label: 'Roles', href: '/admin/roles', icon: '👑' },
    { label: 'Permissions', href: '/admin/permissions', icon: '🔐' },
    { label: 'Settings', href: '/admin/settings', icon: '⚙️' },
  ];

  const publicNavItems = [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
    { label: 'Services', href: '/services' },
    { label: 'Contact', href: '/contact' },
  ];

  if (loading) {
    return (
      <html lang="en">
        <body className={`font-sans bg-[#0b0f19] text-white min-h-screen`}>
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </body>
      </html>
    );
  }

  if (isAuthRoute || isPublicRoute) {
    return (
      <html lang="en">
        <body className={`font-sans bg-[#0b0f19] text-white min-h-screen`}>
          <header className="sticky top-0 bg-[#0b0f19]/80 backdrop-blur-sm z-50 border-b border-blue-500/10">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 text-xl font-bold">
                  <span className="text-blue-400">Crestline Capital</span>
                </Link>
                <nav className="hidden md:flex items-center gap-6">
                  {publicNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`text-sm font-medium transition-colors ${pathname === item.href ? 'text-blue-400' : 'text-white/70 hover:text-white'}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="flex items-center gap-4">
                  {user ? (
                    <>
                      <Link
                        href="/dashboard"
                        className="text-sm font-medium text-white/70 hover:text-white transition-colors"
                      >
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="text-sm font-medium text-white/70 hover:text-red-400 transition-colors"
                      >
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="text-sm font-medium text-white/70 hover:text-white transition-colors"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/register"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                      >
                        Sign Up
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className={`font-sans bg-[#0b0f19] text-white min-h-screen`}>
        {shouldShowSidebar && (
          <aside
            className={`fixed top-0 left-0 w-64 h-full bg-[#121828] border-r border-blue-500/10 z-40 transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="h-full flex flex-col">
              <div className="p-6 border-b border-blue-500/10">
                <Link
                  href={isAdminRoute ? '/admin' : '/dashboard'}
                  className="flex items-center gap-3 text-xl font-bold"
                >
                  <span className="text-blue-400">Crestline</span>
                </Link>
              </div>

              <nav className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-1">
                  {(isAdminRoute ? adminNavItems : customerNavItems).map(
                    (item) => {
                      const isActive = pathname?.startsWith(item.href) ||
                        pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'text-white/70 hover:bg-blue-500/5 hover:text-white'}`}
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    }
                  )}
                </div>
              </nav>

              <div className="p-4 border-t border-blue-500/10">
                <div className="text-xs text-white/40">
                  <p>Crestline Capital</p>
                  <p>Sandbox Mode</p>
                </div>
              </div>
            </div>
          </aside>
        )}

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`min-h-screen transition-all duration-300 ${shouldShowSidebar ? 'lg:ml-64' : ''}`}
        >
          <header className="sticky top-0 bg-[#0b0f19]/80 backdrop-blur-sm z-30 border-b border-blue-500/10">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between max-w-7xl mx-auto">
                <div className="flex items-center gap-4">
                  {shouldShowSidebar && (
                    <button
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="lg:hidden p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                    >
                      <span className="text-xl">☰</span>
                    </button>
                  )}
                  
                  <div className="hidden md:flex items-center gap-2 text-sm text-white/60">
                    <span>{isAdminRoute ? 'Admin' : 'Customer'}</span>
                    <span className="text-blue-500/50">/</span>
                    <span className="text-white">
                      {pathname?.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button className="relative p-2 rounded-lg hover:bg-blue-500/10 transition-colors">
                    <span className="text-xl">🔔</span>
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      0
                    </span>
                  </button>

                  {user && (
                    <div className="relative crestline-user-menu">
                      <button
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                      >
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                          {user.firstName?.charAt(0).toUpperCase()}
                        </div>
                        <div className="hidden md:block text-left">
                          <p className="text-sm font-medium">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs text-white/60 capitalize">{user.role}</p>
                        </div>
                        <span className="hidden md:block text-white/60">▼</span>
                      </button>

                      <div
                        className={`absolute top-full right-0 mt-2 w-56 bg-[#121828] border border-blue-500/10 rounded-lg shadow-xl py-2 z-50 transition-all duration-200 ${userMenuOpen
                            ? 'opacity-100 visible translate-y-0'
                            : 'opacity-0 invisible -translate-y-2'}`}
                      >
                        <Link
                          href="/profile"
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-blue-500/10 transition-colors"
                        >
                          <span>👤</span>
                          <span>Profile</span>
                        </Link>
                        <Link
                          href="/settings"
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-blue-500/10 transition-colors"
                        >
                          <span>⚙️</span>
                          <span>Settings</span>
                        </Link>
                        {isAdminRoute ? (
                          <Link
                            href="/dashboard"
                            className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-blue-500/10 transition-colors"
                          >
                            <span>🏠</span>
                            <span>Customer View</span>
                          </Link>
                        ) : (
                          user.role === 'ADMIN' && (
                            <Link
                              href="/admin"
                              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-blue-500/10 transition-colors"
                            >
                              <span>👑</span>
                              <span>Admin Panel</span>
                            </Link>
                          )
                        )}
                        <button
                          onClick={handleSignOut}
                          className="flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 w-full transition-colors"
                        >
                          <span>🔴</span>
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 lg:p-6 max-w-7xl mx-auto w-full">{children}</main>

          {!shouldShowSidebar && isPublicRoute && (
            <header className="sticky top-0 bg-[#0b0f19]/80 backdrop-blur-sm z-50 border-b border-blue-500/10">
              <div className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <Link href="/" className="flex items-center gap-2 text-xl font-bold">
                    <span className="text-blue-400">Crestline Capital</span>
                  </Link>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="md:hidden p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                  >
                    <span className="text-xl">☰</span>
                  </button>
                </div>
              </div>
            </header>
          )}
        </div>
      </body>
    </html>
  );
}
