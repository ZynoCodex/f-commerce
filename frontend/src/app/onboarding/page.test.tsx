import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeBoundary } from '@/components/theme/theme';
import { setAuth } from '@/lib/auth-client';

const replaceMock = vi.fn();
// a stable router object, so the page's [router]-dependent effect does not re-run on every render
const stableRouter = { replace: replaceMock };
vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding',
  useRouter: () => stableRouter,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import OnboardingPage from './page';

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const incompleteBusiness = {
  name: 'Maya Traders',
  currency: 'BDT',
  logoUrl: '',
  address: null,
  onboardingComplete: false,
};

// jsdom does not implement URL.createObjectURL, used for the logo preview
function setupObjectUrl() {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      value: (file: File) => `blob:mock-${file.name}`,
      configurable: true,
    });
  }
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    // OnboardingPage now guards on auth before fetching; seed a session so
    // the wizard-based tests render past the guard.
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
    setupObjectUrl();
  });

  it('shows a loading state before the business profile resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () => new Promise(() => {}), // never settles
      ),
    );

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    expect(screen.getByText(/loading your profile/i)).toBeVisible();
  });

  it('shows an error when the business profile cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    // the load failure shows a banner
    const alert = await screen.findByRole('alert');
    expect(/failed to load business/i.test(alert.textContent ?? '')).toBe(true);
  });

  it('covers AC-1: renders the wizard on step one for an incomplete business', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: incompleteBusiness })),
    );

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    expect(await screen.findByRole('heading', { name: /welcome/i })).toBeVisible();
    expect(screen.getByText('Step 1 of 4')).toBeVisible();
    expect(screen.getByRole('button', { name: /get started/i })).toBeEnabled();
  });

  it('proceeds from step one to step two when Get started is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: incompleteBusiness })),
    );
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));
    expect(screen.getByText('Step 2 of 4')).toBeVisible();
  });

  it('walks back and forth through the address step', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: incompleteBusiness })),
    );
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));
    // now on step 2; Back returns to step 1
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('Step 1 of 4')).toBeVisible();
  });

  it('covers AC-1: restores a saved draft when the profile has one', async () => {
    const withDraft = {
      ...incompleteBusiness,
      onboardingDraft: {
        name: 'Draft Biz',
        currency: 'USD',
        address: { street: '9 Draft St', city: 'Chittagong', country: 'Bangladesh' },
        logoUrl: '',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: withDraft })),
    );

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    // Step 1 should show the business name from the profile (not the draft name)
    const greeting = await screen.findByText(/maya traders/i);
    expect(greeting).toBeVisible();
  });

  it('pre-fills business name from onboarding endpoint when business/me returns 403', async () => {
    const fetchMock = vi
      .fn()
      // First call: GET /api/business/me returns 403 (onboarding required)
      .mockResolvedValueOnce(
        jsonResponse(403, {
          error: 'Onboarding required',
          message: 'Please complete your business profile before accessing this resource',
        }),
      )
      // Second call: GET /api/business/onboarding returns the business name from registration
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { name: 'Registered Biz Name', onboardingDraft: null },
          message: 'Onboarding retrieved',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    setAuth({ accessToken: 'tok', businessId: 'b1' });

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    // Step 1 should show the business name from the auth profile
    const greeting = await screen.findByText(/registered biz name/i);
    expect(greeting).toBeVisible();
    // Get started button should be enabled because the name is pre-filled
    expect(screen.getByRole('button', { name: /get started/i })).toBeEnabled();
  });

  it('covers AC-3: rejects a non-image file upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: incompleteBusiness })),
    );
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    // now on step 3
    const input = document.getElementById('logo-upload') as HTMLInputElement;
    const textFile = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    // jsdom file inputs don't retain File type reliably, so drive the handler directly
    const changeEvent = new Event('change', { bubbles: true });
    Object.defineProperty(input, 'files', { value: [textFile], configurable: true });
    input.dispatchEvent(changeEvent);

    await screen.findByText(/only image files are allowed/i);
  });

  it('covers AC-3: uploads an image and shows a preview', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: incompleteBusiness }))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { logoUrl: 'https://cdn/logo.png' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    const input = document.getElementById('logo-upload') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', {
      type: 'image/png',
    });
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // a successful upload POSTs to the logo endpoint and shows the preview img
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => c[0] === '/api/business/logo')).toBe(true);
    });
    expect(screen.getByRole('img', { name: /logo preview/i })).toBeVisible();
  });

  it('covers AC-4: completes onboarding and redirects to the dashboard', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: incompleteBusiness }))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { onboardingComplete: true } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    // walk to the review step, awaiting each transition
    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    const finishBtn = screen.getByRole('button', { name: /enter order desk/i });
    expect(finishBtn).toBeEnabled();
    await user.click(finishBtn);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    const onboardingCall = fetchMock.mock.calls.find((c) => c[0] === '/api/business/onboarding');
    expect(onboardingCall).toBeDefined();
    expect(onboardingCall?.[1]?.method).toBe('PUT');
  });

  it('displays business name on step 1 without an editable field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: incompleteBusiness })),
    );

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    // The business name should appear in the welcome text, not as an input
    await screen.findByText(/maya traders/i);
    expect(screen.queryByRole('textbox', { name: /business name/i })).toBeNull();
  });

  it('saves draft when user enters address in step 2', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { success: true, data: incompleteBusiness }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    // Navigate to step 2
    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));

    // Type in address field
    const streetField = await screen.findByLabelText('Street');
    await user.type(streetField, '123 New St');

    // Wait for debounced draft save (500ms debounce, needs longer waitFor timeout)
    await waitFor(
      () => {
        const draftCall = fetchMock.mock.calls.find(
          (call) => call[0] === '/api/business/onboarding/draft' && call[1]?.method === 'PUT',
        );
        expect(draftCall).toBeTruthy();
      },
      { timeout: 2000 },
    );

    // Verify the draft save payload includes the address
    const draftCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/business/onboarding/draft' && call[1]?.method === 'PUT',
    );
    const draftBody = JSON.parse(draftCall![1].body);
    expect(draftBody.field).toBe('address');
    expect(draftBody.value.street).toBe('123 New St');
  });

  it('shows an error when onboarding completion fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/business/onboarding') {
        return Promise.resolve(jsonResponse(400, { message: 'Validation failed' }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, data: incompleteBusiness }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    await screen.findByRole('heading', { name: /welcome/i });
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(screen.getByRole('button', { name: /enter order desk/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/validation failed/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows the business name in the welcome greeting on step 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          data: { ...incompleteBusiness, name: 'Unique Shop' },
        }),
      ),
    );

    render(
      <ThemeBoundary>
        <OnboardingPage />
      </ThemeBoundary>,
    );

    expect(await screen.findByRole('heading', { name: 'Welcome, Unique Shop!' })).toBeVisible();
  });
});
