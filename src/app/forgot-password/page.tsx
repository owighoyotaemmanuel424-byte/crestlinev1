'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, LifeBuoy } from 'lucide-react';

import { AuthLayout } from '@/components/auth-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.success !== false) {
        setSent(true);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setError(payload?.message || payload?.error || 'We could not verify that request.');
        return;
      }

      // Reset emails are not enabled in this sandbox build.
      setFallback(true);
    } catch {
      setFallback(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a secure reset link."
      highlights={[
        'Reset links expire after one hour',
        'We never email your password',
        'Support can verify you if you are locked out',
      ]}
      footer={
        <p>
          Remembered it?{' '}
          <Link href="/login" className="chase-link">
            Back to sign in
          </Link>
        </p>
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {sent ? (
        <div className="rounded-xl border border-success/25 bg-success/[0.06] p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Check your inbox</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            If <span className="font-medium text-foreground">{email}</span> matches an
            account, a reset link is on its way. It expires in one hour.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/login">Return to sign in</Link>
          </Button>
        </div>
      ) : fallback ? (
        <div className="space-y-5">
          <Alert variant="warning" showIcon>
            <AlertDescription>
              Automated reset emails are not switched on in this sandbox environment.
              Our support team can reset your password after verifying your identity.
            </AlertDescription>
          </Alert>
          <Button asChild size="lg" className="w-full">
            <Link href="/support">
              <LifeBuoy className="h-4 w-4" />
              Contact support
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Input
            type="email"
            label="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
