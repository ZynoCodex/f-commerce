import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test-utils/render';
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
  timezone: 'Asia/Dhaka',
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/business/me' && init?.method === 'PUT') {
        return jsonResponse(200, { success: true, data: businessData });
      }
      return jsonResponse(200, { success: true, data: businessData });
    });
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

  it('covers AC-6: shows the stored timezone and its description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: businessData })),
    );

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    expect(await screen.findByLabelText(/timezone/i)).toHaveValue('Asia/Dhaka');
    expect(screen.getByText(/used for delivery dates and timestamps/i)).toBeVisible();
  });

  it('covers AC-6: persists the fallback when the stored timezone is invalid', async () => {
    const invalidBusiness = { ...businessData, timezone: 'Mars/Olympus' };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/business/me' && init?.method === 'PUT') {
        return jsonResponse(200, {
          success: true,
          data: { ...businessData, timezone: 'Asia/Dhaka' },
        });
      }
      return jsonResponse(200, { success: true, data: invalidBusiness });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    expect(await screen.findByLabelText(/timezone/i)).toHaveValue('Asia/Dhaka');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // A corrupt stored value uses the fallback as its baseline, so no dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
      expect(putCall).toBeTruthy();
      expect(JSON.parse(String(putCall![1]!.body)).timezone).toBe('Asia/Dhaka');
    });
  });

  it('covers AC-6: opens a confirmation dialog before changing the timezone', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/business/me' && init?.method === 'PUT') {
        return jsonResponse(200, {
          success: true,
          data: { ...businessData, timezone: 'Europe/Berlin' },
        });
      }
      return jsonResponse(200, { success: true, data: businessData });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByLabelText(/timezone/i);
    await user.selectOptions(screen.getByLabelText(/timezone/i), 'Europe/Berlin');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/new timezone: europe\/berlin/i)).toBeVisible();
    expect(
      within(dialog).getByText(/existing order dates do not change.*overdue may change/i),
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: /change timezone/i })).toBeEnabled();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PUT')).toBe(false);
  });

  it('covers AC-6: cancelling reverts the select and saves nothing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return jsonResponse(200, { success: true, data: businessData });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByLabelText(/timezone/i);
    await user.selectOptions(screen.getByLabelText(/timezone/i), 'Europe/Berlin');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/timezone/i)).toHaveValue('Asia/Dhaka');
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PUT')).toBe(false);
  });

  it('covers AC-6: confirming sends the new timezone and updates the baseline', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/business/me' && init?.method === 'PUT') {
        return jsonResponse(200, {
          success: true,
          data: { ...businessData, timezone: 'Europe/Berlin' },
        });
      }
      return jsonResponse(200, { success: true, data: businessData });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByLabelText(/timezone/i);
    await user.selectOptions(screen.getByLabelText(/timezone/i), 'Europe/Berlin');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /change timezone/i }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/profile updated/i);
    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(JSON.parse(String(putCall![1]!.body)).timezone).toBe('Europe/Berlin');
    expect(screen.getByLabelText(/timezone/i)).toHaveValue('Europe/Berlin');
  });

  it('covers AC-12: Escape cancels the timezone dialog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        void url;
        void init;
        return jsonResponse(200, { success: true, data: businessData });
      }),
    );
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <SettingsPage />
      </ThemeBoundary>,
    );

    await screen.findByLabelText(/timezone/i);
    await user.selectOptions(screen.getByLabelText(/timezone/i), 'Europe/Berlin');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('dialog')).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/timezone/i)).toHaveValue('Asia/Dhaka');
  });

  it('shows an error message when saving fails', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/business/me' && init?.method === 'PUT') {
        return jsonResponse(400, { error: 'Invalid input', message: 'Name is required' });
      }
      return jsonResponse(200, { success: true, data: businessData });
    });
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/business/me' && init?.method === 'PUT') {
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      }
      return jsonResponse(200, { success: true, data: businessData });
    });
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

    resolveSave(jsonResponse(200, { success: true, data: businessData }));
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
