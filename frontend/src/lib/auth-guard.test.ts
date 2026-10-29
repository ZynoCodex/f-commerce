import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useRequireAuth } from '@/lib/auth-guard';

const replaceMock = vi.fn();

// mock next/navigation BEFORE importing the hook under test
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  describe('protected route (requireAuth: true, the default)', () => {
    it('redirects to /login and reports not-ready when no session is present', () => {
      const { result } = renderHook(() => useRequireAuth());

      expect(replaceMock).toHaveBeenCalledWith('/login');
      // redirecting visitors should not render guarded content
      expect(result.current).toBe(false);
    });

    it('renders immediately (ready) when a session is present', () => {
      window.localStorage.setItem('accessToken', 'tok');
      window.localStorage.setItem('businessId', 'biz-1');

      const { result } = renderHook(() => useRequireAuth());

      expect(replaceMock).not.toHaveBeenCalled();
      expect(result.current).toBe(true);
    });

    it('redirects when only a stale accessToken is stored', () => {
      window.localStorage.setItem('accessToken', 'tok');

      renderHook(() => useRequireAuth());

      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  describe('public-only route (requireAuth: false)', () => {
    it('renders immediately (ready) when there is no session', () => {
      const { result } = renderHook(() => useRequireAuth({ requireAuth: false }));

      expect(replaceMock).not.toHaveBeenCalled();
      expect(result.current).toBe(true);
    });

    it('redirects to /onboarding and reports not-ready when a session is present', () => {
      window.localStorage.setItem('accessToken', 'tok');
      window.localStorage.setItem('businessId', 'biz-1');

      const { result } = renderHook(() => useRequireAuth({ requireAuth: false }));

      // /onboarding is the single entry point after auth; it redirects to /dashboard if complete
      expect(replaceMock).toHaveBeenCalledWith('/onboarding');
      expect(result.current).toBe(false);
    });

    it('awaits a redirect resolver before navigating, so the destination is resolved once', async () => {
      window.localStorage.setItem('accessToken', 'tok');
      window.localStorage.setItem('businessId', 'biz-1');
      const resolve = vi.fn().mockResolvedValue('/dashboard');

      renderHook(() => useRequireAuth({ requireAuth: false, redirectTo: resolve }));

      expect(replaceMock).not.toHaveBeenCalled();
      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    it('falls back to /onboarding when the resolver rejects', async () => {
      window.localStorage.setItem('accessToken', 'tok');
      window.localStorage.setItem('businessId', 'biz-1');
      const resolve = vi.fn().mockRejectedValue(new Error('profile unavailable'));

      renderHook(() => useRequireAuth({ requireAuth: false, redirectTo: resolve }));

      // The rejection must not become an unhandled promise rejection, and the
      // wizard is the safe landing spot when the destination is unknown.
      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/onboarding'));
      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });
});
