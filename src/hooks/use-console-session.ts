'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { isConsoleRole } from '@/lib/console';

/** The bearer token the console stores after a successful operator sign-in. */
export const CONSOLE_TOKEN_KEY = 'token';

export interface ConsoleOperator {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status?: string;
}

export interface UseConsoleSession {
  operator: ConsoleOperator | null;
  token: string | null;
  displayName: string;
  isReady: boolean;
  signOut: () => Promise<void>;
}

/**
 * Resolve the operator session for the privileged console.
 *
 * Customer credentials are rejected here as well as at sign-in, so a session
 * that is not allowed into the console is cleared instead of rendering
 * privileged chrome over it.
 */
export function useConsoleSession(): UseConsoleSession {
  const router = useRouter();
  const [operator, setOperator] = useState<ConsoleOperator | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = window.localStorage.getItem(CONSOLE_TOKEN_KEY);

    if (!stored) {
      router.replace('/admin/login');
      return;
    }

    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + stored } })
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthenticated');
        const payload = await response.json();
        const me = (payload?.data ?? payload) as ConsoleOperator;
        if (!isConsoleRole(me?.role)) throw new Error('forbidden');
        if (!cancelled) {
          setOperator(me);
          setToken(stored);
        }
      })
      .catch(() => {
        window.localStorage.removeItem(CONSOLE_TOKEN_KEY);
        router.replace('/admin/login');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    const stored = window.localStorage.getItem(CONSOLE_TOKEN_KEY);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: stored ? { Authorization: 'Bearer ' + stored } : undefined,
      });
    } catch {
      // The local session is cleared regardless.
    }
    window.localStorage.removeItem(CONSOLE_TOKEN_KEY);
    router.replace('/admin/login');
  }, [router]);

  const displayName =
    operator?.name ||
    [operator?.firstName, operator?.lastName].filter(Boolean).join(' ') ||
    operator?.email ||
    '';

  return { operator, token, displayName, isReady: Boolean(operator && token), signOut };
}

export default useConsoleSession;
