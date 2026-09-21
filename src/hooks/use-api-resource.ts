'use client';

// src/hooks/use-api-resource.ts
// Small helpers for calling the JSON API with the stored bearer token.

import { useCallback, useEffect, useState } from 'react';

export interface UseApiResourceReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function authToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

function unwrap<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

function messageFrom(payload: any, status: number): string {
  return (
    payload?.message ||
    payload?.error ||
    (status === 401
      ? 'Your session has expired. Please sign in again.'
      : `Request failed (${status})`)
  );
}

/**
 * GET a resource. Pass a stable path string (a literal or memoised value) so
 * the request is not repeated on every render.
 */
export function useApiResource<T = any>(path: string | null): UseApiResourceReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = authToken();
        const response = await fetch(path, {
          headers: token ? { Authorization: 'Bearer ' + token } : undefined,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || payload?.success === false) {
          throw new Error(messageFrom(payload, response.status));
        }

        if (!cancelled) {
          setData(unwrap<T>(payload));
          setIsLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setData(null);
          setError(caught instanceof Error ? caught.message : 'Something went wrong');
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  return { data, isLoading, error, refetch };
}

export interface UseApiMutationReturn {
  mutate: <T = any>(
    path: string,
    method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: unknown
  ) => Promise<T>;
  isSubmitting: boolean;
}

/** POST/PATCH/PUT/DELETE helper for forms. */
export function useApiMutation(): UseApiMutationReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mutate = useCallback(
    async <T = any,>(
      path: string,
      method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
      body?: unknown
    ): Promise<T> => {
      setIsSubmitting(true);
      try {
        const token = authToken();
        const response = await fetch(path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || payload?.success === false) {
          throw new Error(messageFrom(payload, response.status));
        }

        return unwrap<T>(payload);
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return { mutate, isSubmitting };
}
