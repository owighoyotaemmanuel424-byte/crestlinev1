// src/app/settings/page.tsx
// Account settings

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Globe, LogOut, Monitor, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useToast } from '@/hooks';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'crestline.preferences';

interface Preferences {
  transactionAlerts: boolean;
  securityAlerts: boolean;
  productUpdates: boolean;
  currency: string;
}

const DEFAULTS: Preferences = {
  transactionAlerts: true,
  securityAlerts: true,
  productUpdates: false,
  currency: 'USD',
};

export default function SettingsPage() {
  const router = useRouter();
  const { success } = useToast();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPreferences({ ...DEFAULTS, ...JSON.parse(stored) });
      }
    } catch {
      // Ignore malformed preferences.
    }
    setLoaded(true);
  }, []);

  const update = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable in private mode.
    }
  };

  const handleSignOut = () => {
    window.localStorage.removeItem('token');
    success('You have been signed out on this device.', 'Signed out');
    router.replace('/login');
  };

  const toggles: { key: keyof Preferences; title: string; body: string }[] = [
    {
      key: 'transactionAlerts',
      title: 'Transaction alerts',
      body: 'Get notified the moment money moves in or out of an account.',
    },
    {
      key: 'securityAlerts',
      title: 'Security alerts',
      body: 'Sign-ins from new devices, password changes and blocked attempts.',
    },
    {
      key: 'productUpdates',
      title: 'Product news',
      body: 'Occasional updates about new features and rate changes.',
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Control how we contact you, how amounts are displayed and the security of this device."
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <section className="chase-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                <Bell className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Notifications</h2>
                <p className="text-sm text-muted-foreground">
                  Choose which alerts appear in your inbox.
                </p>
              </div>
            </div>

            <ul className="mt-5 divide-y divide-border">
              {toggles.map((toggle) => {
                const enabled = Boolean(preferences[toggle.key]);
                return (
                  <li key={toggle.key} className="flex items-start justify-between gap-5 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{toggle.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{toggle.body}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={toggle.title}
                      disabled={!loaded}
                      onClick={() => update({ [toggle.key]: !enabled } as Partial<Preferences>)}
                      className={cn(
                        'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                        enabled ? 'bg-primary' : 'bg-muted-foreground/35'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                          enabled ? 'translate-x-[1.4rem]' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="chase-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                <Globe className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Display and region</h2>
                <p className="text-sm text-muted-foreground">
                  Used when we show balances and statements.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Select
                label="Preferred currency"
                value={preferences.currency}
                onValueChange={(value) => update({ currency: value })}
              >
                <Select.Option value="USD">USD — US Dollar</Select.Option>
                <Select.Option value="NGN">NGN — Nigerian Naira</Select.Option>
                <Select.Option value="EUR">EUR — Euro</Select.Option>
                <Select.Option value="GBP">GBP — Pound Sterling</Select.Option>
              </Select>
              <Select label="Language" value="en" onValueChange={() => undefined}>
                <Select.Option value="en">English (US)</Select.Option>
                <Select.Option value="fr">Français</Select.Option>
                <Select.Option value="es">Español</Select.Option>
              </Select>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Preferences are stored on this device in this sandbox build.
            </p>
          </section>
        </div>

        <div className="space-y-5">
          <section className="chase-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                <ShieldCheck className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Security</h2>
                <p className="text-sm text-muted-foreground">
                  Protect your accounts and sessions.
                </p>
              </div>
            </div>

            <ul className="mt-5 space-y-3.5 text-sm">
              <li className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Two-factor sign-in</span>
                <span className="font-medium text-success">Enabled</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Device approvals</span>
                <span className="font-medium">This device only</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Identity check</span>
                <Link href="/kyc" className="font-semibold text-primary hover:underline">
                  Review
                </Link>
              </li>
            </ul>

            <Button variant="outline" className="mt-5 w-full" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out of this device
            </Button>
          </section>

          <section className="chase-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Monitor className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Session</h2>
                <p className="text-sm text-muted-foreground">Current browser session</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd className="font-medium">This device</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Session length</dt>
                <dd className="font-medium">Up to 7 days</dd>
              </div>
            </dl>
            <p className="mt-5 rounded-lg bg-muted p-3.5 text-xs leading-relaxed text-muted-foreground">
              Need to change your email or close an account? Our support team can help after
              verifying your identity.
            </p>
            <Button asChild variant="ghost" className="mt-4 w-full justify-start px-0">
              <Link href="/support">Contact support</Link>
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
