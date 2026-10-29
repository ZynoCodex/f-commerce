'use client';

import { useState } from 'react';
import { Button, Field, FormMessage, Input } from '@/components/ui/primitives';
import { apiFetch, setAuth } from '@/lib/auth-client';
import { useRequireAuth } from '@/lib/auth-guard';

/**
 * Ask the API where this member belongs after signing in. A completed business
 * goes straight to the order desk; an unfinished one goes to the wizard.
 *
 * Falls back to the wizard when the profile cannot be read, so a failed check
 * never hides onboarding from someone who has not finished it.
 */
async function landingPath(): Promise<'/dashboard' | '/onboarding'> {
  try {
    const res = await apiFetch('/api/business/me', { method: 'GET' });
    // A 403 ONBOARDING_REQUIRED is the normal unfinished case; any other
    // failure also opens the wizard, which resolves the truth for itself.
    if (!res.ok) return '/onboarding';

    const payload: unknown = await res.json();
    const data = (payload as { data?: { onboardingComplete?: unknown } }).data;
    return data?.onboardingComplete === true ? '/dashboard' : '/onboarding';
  } catch {
    return '/onboarding';
  }
}

export default function LoginPage() {
  // Authenticated users shouldn't see the sign-in / register form.
  // Note: all hooks below must stay unconditional so hook order is stable
  // across the ready/not-ready renders.
  const ready = useRequireAuth({ requireAuth: false, redirectTo: landingPath });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const body: Record<string, string> = { email, password };
      if (isRegistering) {
        body.name = email.split('@')[0];
        body.businessName = businessName;
      }

      const res = await apiFetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || 'Authentication failed');
      }

      const data = await res.json();
      const token = data.accessToken;

      // Use businessId from response if available (extracted from JWT by backend)
      // Fallback to decoding JWT client-side for backward compatibility
      let businessId = data.businessId;
      if (!businessId && token?.split('.').length === 3) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          businessId = payload.memberships?.[0]?.businessId;
        } catch {
          // Token decode failed, continue without businessId
        }
      }

      if (!businessId) throw new Error('No business association found');

      setAuth({ accessToken: token, businessId });
      // Setting the session is enough: the route guard owns the redirect and
      // resolves the destination once, so the wizard cannot flash first.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Render a lightweight placeholder while redirecting so React swaps the
  // tree cleanly instead of leaving a null shell behind.
  if (!ready)
    return <div className="flex min-h-screen items-center justify-center bg-canvas p-4" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-2">
          {isRegistering ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-sm text-body mb-6">
          {isRegistering ? 'Register to start managing your orders.' : 'Sign in to your account.'}
        </p>

        {error && <FormMessage id="login-error">{error}</FormMessage>}

        <form onSubmit={handleSubmit} className="space-y-6">
          {isRegistering && (
            <Field label="Business name" htmlFor="business-name">
              <Input
                id="business-name"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Maya Traders"
                required
              />
            </Field>
          )}

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              minLength={8}
            />
          </Field>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Working...' : isRegistering ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-body">
          {isRegistering ? 'Already have an account?' : "Don't have an account yet?"}
          <button
            className="ml-1 text-sky-strong hover:underline"
            onClick={() => setIsRegistering(!isRegistering)}
            type="button"
          >
            {isRegistering ? 'Sign in' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}
