// src/hooks/useAuth.ts
// Authentication hook for Crestline Capital

import { useState, useEffect, useCallback } from 'react';
import { usersApi, User } from '@/lib/api';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface UseAuthReturn extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refetch: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
      const user = await usersApi.getProfile();
      setAuthState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error.message || error.error || 'Failed to fetch profile';
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: message,
      });
      // Clear token if profile fetch fails
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      // Call login API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.message || errorData.error || 'Login failed';
        throw new Error(message);
      }

      const data = await response.json();
      
      // Store token
      if (typeof window !== 'undefined' && data.token) {
        localStorage.setItem('token', data.token);
      }

      // Fetch user profile
      await refetch();
    } catch (error: any) {
      const message = error.message || 'Login failed';
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      throw error;
    }
  }, [refetch]);

  const logout = useCallback(() => {
    // Clear token
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    
    // Clear auth state
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  // Initialize on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      refetch();
    } else {
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, [refetch]);

  return {
    ...authState,
    login,
    logout,
    refetch,
  };
}

export default useAuth;