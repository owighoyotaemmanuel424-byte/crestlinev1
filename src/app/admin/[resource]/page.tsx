'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

import { ConsoleBadge } from '@/components/admin/admin-ui';
import { ConsoleShell } from '@/components/admin/console-shell';
import { ResourceConsole } from '@/components/admin/resource-console';
import { useConsoleSession } from '@/hooks/use-console-session';
import { getAdminResource } from '@/lib/admin/resources';

export default function AdminResourcePage() {
  const params = useParams<{ resource: string }>();
  const resource = getAdminResource(
    typeof params?.resource === 'string' ? params.resource : undefined
  );
  const { operator, displayName, token, isReady, signOut } = useConsoleSession();

  if (!resource) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19] px-6 text-center">
        <div className="max-w-md rounded-xl border border-white/10 bg-[#161e2e] p-8">
          <ShieldAlert className="mx-auto h-6 w-6 text-slate-500" />
          <h1 className="mt-4 text-lg font-semibold text-white">Unknown console module</h1>
          <p className="mt-2 text-sm text-slate-400">
            That queue is not part of the operations console.
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-flex h-9 items-center rounded-md border border-white/15 bg-white/[0.04] px-3.5 text-[0.8125rem] font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  if (!isReady || !operator || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19] text-sm text-slate-400">
        Verifying console session…
      </div>
    );
  }

  return (
    <ConsoleShell operator={operator} displayName={displayName} onSignOut={signOut}>
      <ResourceConsole resource={resource} token={token} />
    </ConsoleShell>
  );
}
