// src/app/profile/page.tsx
// Customer profile

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, Mail, Phone, Save, ShieldCheck, User } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useApiMutation, useApiResource, useToast } from '@/hooks';

export default function ProfilePage() {
  const profile = useApiResource<any>('/api/profile');
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();

  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const data = profile.data;
    if (!data) return;
    setForm({
      firstName: data.firstName || data.user?.firstName || '',
      lastName: data.lastName || data.user?.lastName || '',
      phone: data.phone || data.user?.phone || '',
    });
  }, [profile.data]);

  const email = profile.data?.email || profile.data?.user?.email || '';
  const role = profile.data?.role || profile.data?.user?.role || 'CUSTOMER';
  const status = profile.data?.status || profile.data?.user?.status || 'ACTIVE';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError('First and last name are required.');
      return;
    }

    try {
      await mutate('/api/profile', 'PATCH', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
      });
      profile.refetch();
      success('Your profile details have been updated.', 'Saved');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save your details';
      setFormError(message);
      showError(message, 'Not saved');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Keep your contact details current so we can reach you about your accounts."
        actions={
          <Button asChild variant="outline">
            <Link href="/settings">
              <ShieldCheck className="h-4 w-4" />
              Security settings
            </Link>
          </Button>
        }
      />

      {profile.isLoading ? (
        <LoadingRows rows={3} />
      ) : profile.error ? (
        <ErrorState
          title="We could not load your profile"
          description={profile.error}
          action={
            <Button variant="outline" onClick={profile.refetch}>
              Try again
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <form className="chase-card p-6 sm:p-7" onSubmit={submit}>
            <h2 className="text-base font-semibold tracking-tight">Personal details</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              These appear on statements and transfer confirmations.
            </p>

            {formError && (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Input
                label="First name"
                value={form.firstName}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, firstName: event.target.value }))
                }
                placeholder="Jordan"
              />
              <Input
                label="Last name"
                value={form.lastName}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, lastName: event.target.value }))
                }
                placeholder="Adeyemi"
              />
              <Input
                label="Email address"
                value={email}
                readOnly
                disabled
                hint="Contact support to change the email on your account."
              />
              <Input
                label="Phone number"
                value={form.phone}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, phone: event.target.value }))
                }
                placeholder="+1 555 0100"
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                <Save className="h-4 w-4" />
                Save changes
              </Button>
            </div>
          </form>

          <div className="space-y-5">
            <div className="chase-card p-6">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
                  {(form.firstName.charAt(0) + form.lastName.charAt(0)).toUpperCase() || 'CC'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {form.firstName || form.lastName
                      ? `${form.firstName} ${form.lastName}`.trim()
                      : 'Your account'}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{email || '—'}</p>
                </div>
              </div>

              <dl className="mt-5 space-y-3.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" /> Role
                  </dt>
                  <dd>
                    <Badge variant="primary">{role}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <BadgeCheck className="h-4 w-4" /> Status
                  </dt>
                  <dd>
                    <Badge variant={status === 'ACTIVE' ? 'success' : 'warning'}>{status}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" /> Email verified
                  </dt>
                  <dd className="font-medium">
                    {profile.data?.emailVerified ? 'Yes' : 'Pending'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" /> Phone verified
                  </dt>
                  <dd className="font-medium">
                    {profile.data?.phoneVerified ? 'Yes' : 'Pending'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="chase-card p-6">
              <h2 className="text-base font-semibold tracking-tight">Keep your account secure</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>Review your verification documents regularly</li>
                <li>Never share one-time codes with anyone</li>
                <li>Tell us immediately if a device is lost</li>
              </ul>
              <div className="mt-5 flex gap-2.5">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href="/kyc">Verification</Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="flex-1">
                  <Link href="/support">Support</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
