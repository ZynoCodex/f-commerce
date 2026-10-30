import { screen, within } from '@testing-library/react';
import { render } from '@/test-utils/render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerOrderDto, CustomerProfileDto } from '@f-commerce/contracts';

import { ThemeBoundary } from '@/components/theme/theme';
import { setAuth } from '@/lib/auth-client';

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/customers/customer-1',
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useParams: () => ({ id: 'customer-1' }),
}));

import CustomerProfilePage from './page';

// 20:00 UTC is 1:00 PM in Los Angeles, 2:00 AM the next day in Dhaka, and
// 8:00 PM in UTC, so each zone renders a distinct timestamp.
const CREATED = '2026-10-25T20:00:00.000Z';

const customer: CustomerProfileDto = {
  id: 'customer-1',
  name: 'Nusrat Jahan',
  phone: '+8801700000000',
  email: 'nusrat@example.com',
  address: '12 Lake Road',
  notes: null,
  archivedAt: CREATED,
  version: 1,
  createdAt: CREATED,
  updatedAt: CREATED,
  orderCount: 1,
  totalSpent: 5000,
  totalDue: 500,
  currency: 'BDT',
};

const order: CustomerOrderDto = {
  id: 'order-1',
  orderNumber: 'ORD-0001',
  createdAt: CREATED,
  status: 'PENDING',
  total: 5000,
  dueAmount: 500,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installedFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/business/me') {
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          data: { currency: 'BDT', timezone: 'America/Los_Angeles' },
        }),
      );
    }
    if (url.startsWith('/api/customers/customer-1/orders?')) {
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          data: { items: [order], nextCursor: null },
        }),
      );
    }
    if (url === '/api/customers/customer-1') {
      return Promise.resolve(jsonResponse(200, { success: true, data: customer }));
    }
    return Promise.resolve(jsonResponse(404, { error: 'NOT_FOUND', message: 'Not found' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <ThemeBoundary>
      <CustomerProfilePage />
    </ThemeBoundary>,
  );
}

describe('CustomerProfilePage business timezone', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // covers AC-8: every customer timestamp uses the business zone, not the browser zone.
  it('renders added, archived, and order history times in the business zone', async () => {
    installedFetch();

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Nusrat Jahan' })).toBeVisible();
    // The badge renders twice, once in the sidebar and once in the mobile header.
    expect(
      within(await screen.findByRole('complementary', { name: 'Sidebar' })).getByText(
        'America/Los_Angeles · BDT',
      ),
    ).toBeVisible();

    const added = screen.getByText('Added');
    expect(added.nextElementSibling).toHaveTextContent('Oct 25, 2026, 1:00 PM');

    expect(screen.getByText(/Archived on Oct 25, 2026, 1:00 PM/)).toBeVisible();

    const history = screen.getByRole('region', { name: 'Order history' });
    expect(within(history).getAllByText('Oct 25, 2026, 1:00 PM').length).toBeGreaterThan(0);

    expect(screen.queryByText('Oct 25, 2026, 8:00 PM')).toBeNull();
    expect(screen.queryByText('Oct 26, 2026, 2:00 AM')).toBeNull();
  });
});
