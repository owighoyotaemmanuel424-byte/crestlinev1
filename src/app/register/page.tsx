'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';

import { AuthLayout } from '@/components/auth-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'A number', test: (value: string) => /\d/.test(value) },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (!acceptedTerms) {
      setError('Please accept the account terms to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.success === false) {
        setError(
          payload?.message ||
            payload?.error ||
            'We could not open your account. Please review your details and try again.'
        );
        return;
      }

      const token = payload?.data?.token ?? payload?.token;
      if (token) {
        window.localStorage.setItem('token', token);
      }
      router.replace('/dashboard');
    } catch {
      setError('We could not reach Crestline Capital. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Open your account"
      subtitle="It takes about four minutes. You will need your name and email to get started."
      highlights={[
        'No monthly service fees on everyday checking',
        'Instant notifications for every payment',
        'Add savings goals, cards and beneficiaries later',
      ]}
      footer={
        <p>
          Already bank with us?{' '}
          <Link href="/login" className="chase-link">
            Sign in
          </Link>
        </p>
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="First name"
            value={form.firstName}
            onChange={update('firstName')}
            placeholder="Jordan"
            autoComplete="given-name"
            required
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={update('lastName')}
            placeholder="Adeyemi"
            autoComplete="family-name"
            required
          />
        </div>

        <Input
          type="email"
          label="Email address"
          value={form.email}
          onChange={update('email')}
          placeholder="you@example.com"
          autoComplete="email"
          hint="We use this for sign-in and account notices."
          required
        />

        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            label="Password"
            value={form.password}
            onChange={update('password')}
            placeholder="Create a strong password"
            autoComplete="new-password"
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-1 top-[2.4rem] rounded p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <ul className="grid gap-1.5 sm:grid-cols-3">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(form.password);
            return (
              <li
                key={rule.label}
                className={
                  'flex items-center gap-1.5 text-xs ' +
                  (met ? 'text-success' : 'text-muted-foreground')
                }
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {rule.label}
              </li>
            );
          })}
        </ul>

        <Input
          type={showPassword ? 'text' : 'password'}
          label="Confirm password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          error={
            form.confirmPassword && form.confirmPassword !== form.password
              ? 'Passwords do not match'
              : undefined
          }
          required
        />

        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary/30"
          />
          <span>
            I agree to the Crestline Capital account terms and understand this is a
            sandbox demonstration environment.
          </span>
        </label>

        <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
          Open my account
        </Button>
      </form>
    </AuthLayout>
  );
}
