'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Eye,
  EyeOff,
  FileLock2,
  Fingerprint,
  Lock,
  ScanFace,
  ShieldCheck,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { isConsoleRole } from '@/lib/console';

const CONSOLE_MODULES = [
  { label: 'Customer servicing', icon: ScanFace },
  { label: 'KYC review queue', icon: FileLock2 },
  { label: 'Fraud triage', icon: Activity },
  { label: 'Immutable audit trail', icon: ShieldCheck },
];

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Operators who already hold a console session skip the form.
  useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem('token');
    if (!token) return;

    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const me = payload?.data ?? payload;
        if (!cancelled && isConsoleRole(me?.role)) {
          router.replace('/admin');
        }
      })
      .catch(() => {
        // No session: stay on the sign-in form.
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Passwords are at least 8 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.success === false) {
        setError(
          payload?.message ||
            payload?.error ||
            'We could not open the console. Check your operator credentials.'
        );
        return;
      }

      const token = payload?.data?.token ?? payload?.token;
      if (!token) {
        setError('Sign-in succeeded but no session was returned. Please try again.');
        return;
      }

      window.localStorage.setItem('token', token);
      router.replace('/admin');
    } catch {
      setError('We could not reach the operations console. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,44%)_minmax(0,1fr)]">
        {/* Console context panel */}
        <aside className="relative hidden overflow-hidden border-r border-purple-500/20 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 top-1/3 h-[26rem] w-[26rem] rounded-full bg-purple-500/12 blur-3xl"
          />
          <div className="relative">
            <Link href="/" aria-label="Crestline Capital home">
              <BrandLogo />
            </Link>

            <span className="mt-10 inline-flex items-center gap-2 rounded-full border border-purple-400/35 bg-purple-500/12 px-3.5 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-purple-200">
              <Fingerprint className="h-3.5 w-3.5" />
              Admin
            </span>

            <h2 className="mt-5 max-w-sm text-3xl font-bold leading-tight tracking-tight text-white">
              Operations console
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              Privileged access for servicing, compliance and fraud teams. Every
              action taken here is written to the immutable audit log.
            </p>

            <ul className="mt-9 space-y-3.5">
              {CONSOLE_MODULES.map(({ label, icon: Icon }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-400/25 bg-purple-500/10 text-purple-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-400">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
            Restricted system. Console credentials are separate from customer
            banking sessions and are subject to rate limiting, session expiry and
            least-privilege review.
          </p>
        </aside>

        {/* Sign-in form */}
        <main className="flex flex-col">
          <header className="flex items-center justify-between px-5 py-5 sm:px-8">
            <span className="lg:hidden">
              <BrandLogo />
            </span>
            <Link
              href="/login"
              className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-100"
            >
              Customer sign in
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center px-5 pb-14 sm:px-8">
            <div className="w-full max-w-[26rem] animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-purple-400/35 bg-purple-500/12 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-purple-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin access
              </span>

              <h1 className="mt-4 text-[1.75rem] font-bold leading-tight tracking-tight text-white">
                Sign in to the console
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Use your operator credentials. Customer accounts cannot open this
                console.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="admin-email"
                    className="mb-1.5 block text-sm font-semibold text-slate-200"
                  >
                    Operator email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@crestline.capital"
                    autoComplete="email"
                    required
                    className="h-11 w-full rounded-md border border-white/12 bg-[#161e2e] px-3.5 text-[0.95rem] text-slate-100 placeholder:text-slate-500 focus-visible:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-password"
                    className="mb-1.5 block text-sm font-semibold text-slate-200"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="h-11 w-full rounded-md border border-white/12 bg-[#161e2e] px-3.5 pr-11 text-[0.95rem] text-slate-100 placeholder:text-slate-500 focus-visible:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 transition-colors hover:text-slate-100"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
                  Open console
                </Button>
              </form>

              <p className="mt-6 text-xs leading-relaxed text-slate-500">
                Lost access? The configured console master key can be entered in place
                of the password for the operator account. Master-key sign-ins raise a
                security alert and are written to the immutable audit trail —
                self-service password reset is not available for privileged roles.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
