import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerDto } from '@f-commerce/contracts';

import { ThemeBoundary } from '@/components/theme/theme';
import { setAuth } from '@/lib/auth-client';

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/customers',
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useParams: () => ({ id: 'customer-1' }),
}));

import CustomersPage from './page';

function makeCustomer(overrides: Partial<CustomerDto> = {}): CustomerDto {
  return {
    id: 'customer-1',
    name: 'Nusrat Jahan',
    phone: '+8801700000000',
    email: null,
    address: null,
    notes: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  return render(
    <ThemeBoundary>
      <CustomersPage />
    </ThemeBoundary>,
  );
}

describe('CustomersPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // covers AC-14: the first list load is announced, not just drawn as skeletons
  it('announces the first list load', () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/customers?')) {
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(jsonResponse(404, { error: 'NOT_FOUND' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const loading = screen.getByText('Loading customers…');
    expect(loading.closest('[role="status"]')).not.toBeNull();
  });

  it('announces the empty customer list', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/customers?')) {
        return Promise.resolve(
          jsonResponse(200, { success: true, data: { items: [], nextCursor: null } }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: 'NOT_FOUND' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const empty = await screen.findByText('No customers yet');
    expect(empty).toBeVisible();
    expect(empty.closest('[role="status"]')).not.toBeNull();
  });

  it('renders a loaded customer row', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/customers?')) {
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            data: { items: [makeCustomer()], nextCursor: null },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: 'NOT_FOUND' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect((await screen.findAllByRole('link', { name: 'Nusrat Jahan' }))[0]).toHaveAttribute(
      'href',
      '/customers/customer-1',
    );
  });
});
