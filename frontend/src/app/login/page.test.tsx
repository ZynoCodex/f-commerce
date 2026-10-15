import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeBoundary } from '@/components/theme/theme';
import { clearAuth, getAuth, setAuth } from '@/lib/auth-client';

const replaceMock = vi.fn();
const stableRouter = { replace: replaceMock };
vi.mock('next/navigation', () => ({
  usePathname: () => '/login',
  useRouter: () => stableRouter,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import LoginPage from './page';

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders the sign in form by default', () => {
    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeVisible();
    expect(screen.getByLabelText(/password/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
  });

  it('toggles to the register form and shows the business name field', async () => {
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /^register$/i }));

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /business name/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /^create account$/i })).toBeEnabled();
  });

  it('stores token and businessId and redirects to /onboarding on successful sign in', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { accessToken: 'tok-123', businessId: 'biz-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/onboarding');
    });
    expect(getAuth()).toEqual({ accessToken: 'tok-123', businessId: 'biz-1' });
  });

  it('sends businessName in the register request body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { accessToken: 'tok', businessId: 'biz' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await user.type(screen.getByRole('textbox', { name: /business name/i }), 'Maya Traders');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.businessName).toBe('Maya Traders');
    expect(body.email).toBe('a@b.com');
  });

  it('shows an error when authentication fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'Invalid credentials' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows an error when the response has no business association', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: 'not-a-jwt' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no business association/i);
  });

  it('falls back to decoding the JWT when businessId is missing from the response', async () => {
    const payload = btoa(JSON.stringify({ memberships: [{ businessId: 'biz-from-jwt' }] }));
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: fakeJwt }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/onboarding');
    });
    expect(getAuth()).toEqual({ accessToken: fakeJwt, businessId: 'biz-from-jwt' });
  });

  it('redirects already authenticated visitors to /onboarding without rendering the form', async () => {
    setAuth({ accessToken: 'tok', businessId: 'biz' });

    render(
      <ThemeBoundary>
        <LoginPage />
      </ThemeBoundary>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/onboarding');
    });
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });
});
