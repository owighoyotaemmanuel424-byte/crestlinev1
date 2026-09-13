'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, CreditCard, DollarSign, TrendingUp, Users, Settings, HelpCircle, LogOut } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/accounts', icon: CreditCard, label: 'Accounts' },
    { href: '/transactions', icon: DollarSign, label: 'Transactions' },
    { href: '/transfers', icon: TrendingUp, label: 'Transfers' },
    { href: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { href: '/settings', icon: Settings, label: 'Settings' },
    { href: '/support', icon: HelpCircle, label: 'Support' },
  ];

  return (
    <aside className="w-64 h-screen bg-white border-r shadow-sm fixed left-0 top-0 z-40">
      <div className="h-full flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-blue-600">
            Crestline Capital
          </h1>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.href}>
                  <Link href={item.href}>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      className={'w-full justify-start ' + (isActive ? 'bg-blue-50' : '')}
                    >
                      <item.icon className="h-4 w-4 mr-3" />
                      {item.label}
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-3" />
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );
}