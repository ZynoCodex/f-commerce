import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from '@/lib/auth-client';

function subscribeToSession(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * Route-protection hook for the custom localStorage JWT auth model.
 *
 * There is no edge-readable session cookie, so protection happens
 * client-side. The session is read through useSyncExternalStore with a null
 * server snapshot, so the server render and hydration both report not-ready.
 *
 * @param options.requireAuth - true (default) for protected routes:
 *   unauthenticated visitors are redirected to `/login`.
 *   false for public-only routes (e.g. /login): authenticated visitors
 *   are redirected to `/onboarding`.
 * @returns `ready` — false until the session has been read on the client and
 *   any redirect is ruled out, true once the user is allowed to see the page.
 */
export function useRequireAuth(options?: { requireAuth?: boolean }): boolean {
  const requireAuth = options?.requireAuth ?? true;
  const router = useRouter();
  const authed = useSyncExternalStore<boolean | null>(
    subscribeToSession,
    () => !!getAuth(),
    () => null,
  );

  const shouldRedirect = authed !== null && (requireAuth ? !authed : authed);

  useEffect(() => {
    if (shouldRedirect) {
      // For protected routes, send unauthenticated visitors to the sign-in page.
      // For public-only routes (e.g. /login), forward authenticated users to
      // /onboarding. The onboarding page itself redirects to /dashboard when
      // complete, so this is the single entry point after auth.
      router.replace(requireAuth ? '/login' : '/onboarding');
    }
  }, [requireAuth, router, shouldRedirect]);

  return authed !== null && !shouldRedirect;
}
