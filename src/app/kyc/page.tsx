// src/app/kyc/page.tsx
// Identity verification

'use client';

import Link from 'next/link';
import { BadgeCheck, FileText, IdCard, LifeBuoy, ShieldCheck, Smartphone } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useApiResource } from '@/hooks';

const REQUIREMENTS = [
  {
    icon: IdCard,
    title: 'Government photo ID',
    body: 'Passport, driving licence or national identity card.',
  },
  {
    icon: Smartphone,
    title: 'A clear selfie',
    body: 'Good lighting, no hats or sunglasses, face the camera directly.',
  },
  {
    icon: FileText,
    title: 'Proof of address',
    body: 'A utility bill or bank statement dated within the last three months.',
  },
];

function statusVariant(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'verified':
    case 'approved':
      return 'success' as const;
    case 'pending':
    case 'under_review':
    case 'submitted':
      return 'warning' as const;
    case 'rejected':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function KycPage() {
  const { data, isLoading, error, refetch } = useApiResource<any>('/api/kyc');

  const status = data?.status || data?.verificationStatus || 'NOT_STARTED';
  const documents: any[] = Array.isArray(data?.documents) ? data.documents : [];
  const verified = /verified|approved/i.test(status);

  return (
    <div>
      <PageHeader
        eyebrow="Compliance"
        title="Identity verification"
        description="One verification covers every product we offer. We review documents the same business day."
        actions={
          <Button asChild variant="outline">
            <Link href="/support">
              <LifeBuoy className="h-4 w-4" />
              Get help verifying
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : error ? (
        <ErrorState
          title="We could not load your verification status"
          description={error}
          action={
            <Button variant="outline" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-5">
            <div className="chase-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">
                      Verification status
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {verified
                        ? 'Your identity is confirmed — all products are unlocked.'
                        : 'Complete the steps below to unlock cards, loans and investing.'}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant(status)} size="lg">
                  {status}
                </Badge>
              </div>

              {verified && (
                <Alert variant="success" className="mt-5">
                  <AlertDescription>
                    Nothing further is needed. We will let you know if your documents ever need
                    renewing.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="chase-card p-6">
              <h2 className="text-base font-semibold tracking-tight">What we need from you</h2>
              <ul className="mt-5 space-y-4">
                {REQUIREMENTS.map((requirement) => (
                  <li key={requirement.title} className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <requirement.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{requirement.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{requirement.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {documents.length > 0 && (
              <div className="chase-card p-6">
                <h2 className="text-base font-semibold tracking-tight">Submitted documents</h2>
                <ul className="mt-4 divide-y divide-border">
                  {documents.map((document, index) => (
                    <li
                      key={document?.id || index}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {(document?.documentType || 'Document').toString().replace(/_/g, ' ')}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {document?.fileName || 'Uploaded file'}
                        </p>
                      </div>
                      <Badge variant={statusVariant(document?.status || document?.verificationStatus)}>
                        {document?.status || document?.verificationStatus || 'submitted'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="chase-card p-6">
              <h2 className="text-base font-semibold tracking-tight">How to submit</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Document upload is handled by our onboarding team in this environment. Open a
                support ticket with the document attached and we will attach it to your file.
              </p>
              <Button asChild className="mt-5 w-full">
                <Link href="/support">Start a verification ticket</Link>
              </Button>
            </div>

            <div className="chase-card p-6">
              <h2 className="text-base font-semibold tracking-tight">Why we ask</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  It is a legal requirement for every bank account
                </li>
                <li className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  It protects you from identity fraud
                </li>
                <li className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  It unlocks higher transfer limits
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
