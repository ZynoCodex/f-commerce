import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeBoundary } from '@/components/theme/theme';
import { clearAuth, setAuth } from '@/lib/auth-client';

const replaceMock = vi.fn();
const stableRouter = { replace: replaceMock };
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => stableRouter,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import SettingsPage from './page';

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const businessData = {
  name: 'Maya Traders',
  currency: 'BDT',
  logoUrl: 'https://res.cloudinary.com/demo/logo.png',
  address: {
    street: '123 Main St',
    city: 'Dhaka',
    region: 'Dhaka Division',
    postalCode: '1000',
    country: 'Bangladesh',
  },
  onboardingComplete: true,
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
  });

  it('shows a loading state before the business profile resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    expect(screen.getByText('Loading...')).toBeVisible();
  });

  it('covers AC-5: renders the form populated with business data for an OWNER', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: businessData })),
    );

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    expect(await screen.findByRole('heading', { name: /business profile/i })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /business name/i })).toHaveValue('Maya Traders');
    expect(screen.getByLabelText(/currency/i)).toHaveValue('BDT');
    expect(screen.getByRole('textbox', { name: /street/i })).toHaveValue('123 Main St');
    expect(screen.getByRole('textbox', { name: /city/i })).toHaveValue('Dhaka');
    expect(screen.getByRole('textbox', { name: /country/i })).toHaveValue('Bangladesh');
  });

  it('shows the logo preview when logoUrl is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: businessData })),
    );

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    const logo = await screen.findByRole('img', { name: /business logo/i });
    expect(logo).toBeVisible();
    expect(logo).toHaveAttribute('src', 'https://res.cloudinary.com/demo/logo.png');
  });

  it('shows an error when the business profile cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(500, { message: 'Server error' })),
    );

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/server error/i);
  });

  it('covers AC-5: shows a success message when the OWNER saves the profile', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: businessData }))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, message: 'Business profile updated' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /business profile/i });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/profile updated/i);
  });

  it('shows an error message when saving fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: businessData }))
      .mockResolvedValueOnce(
        jsonResponse(400, { error: 'Invalid input', message: 'Name is required' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /business profile/i });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
  });

  it('disables the save button while a save is in flight', async () => {
    let resolveSave: (value: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: businessData }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSave = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /business profile/i });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

    resolveSave(jsonResponse(200, { success: true, message: 'ok' }));
    await screen.findByRole('status');
  });

  it('redirects unauthenticated visitors to /login', async () => {
    clearAuth();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByRole('textbox', { name: /business name/i })).toBeNull();
  });
});
