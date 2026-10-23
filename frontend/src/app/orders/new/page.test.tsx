import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerDto, OrderDto, ProductDto } from '@f-commerce/contracts';

import { ThemeBoundary } from '@/components/theme/theme';
import { setAuth } from '@/lib/auth-client';

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/orders/new',
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

import NewOrderPage from './page';

const created = '2026-10-20T10:00:00.000Z';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

const customer: CustomerDto = {
  id: CUSTOMER_ID,
  name: 'Nusrat Jahan',
  phone: '+8801712345678',
  email: null,
  address: '12 Lake Road',
  notes: null,
  archivedAt: null,
  version: 1,
  createdAt: created,
  updatedAt: created,
};

const product: ProductDto = {
  id: PRODUCT_ID,
  name: 'Cotton shirt',
  description: null,
  categoryId: 'category-1',
  categoryName: 'Tops',
  sku: 'SHIRT-1',
  price: 2500,
  cost: 1500,
  stockCount: 10,
  lowStockThreshold: 2,
  availableStock: 10,
  stockStatus: 'inStock',
  images: [],
  options: [],
  variants: [],
  isArchived: false,
  archivedAt: null,
  version: 1,
  createdAt: created,
  updatedAt: created,
};

function makeOrder(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 'order-1',
    orderNumber: 'ORD-0001',
    status: 'PENDING',
    source: 'DIRECT',
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    shippingAddress: customer.address,
    notes: null,
    deliveryDeadline: null,
    subtotal: 5000,
    deliveryFee: 100,
    discount: 50,
    total: 5050,
    paidAmount: 0,
    dueAmount: 5050,
    version: 1,
    createdAt: created,
    updatedAt: created,
    items: [
      {
        id: 'line-1',
        productId: product.id,
        variantId: null,
        productName: product.name,
        variantLabel: null,
        price: product.price,
        cost: 1500,
        quantity: 2,
        subtotal: 5000,
        position: 0,
      },
    ],
    history: [
      {
        id: 'history-1',
        fromStatus: null,
        toStatus: 'PENDING',
        note: null,
        changedByName: 'Maya Owner',
        createdAt: created,
      },
    ],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type HandlerResult = Response | Promise<Response> | undefined;

function installedFetch(
  handler: (url: string, init?: RequestInit) => HandlerResult,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      handler(String(input), init) ??
        jsonResponse(404, { error: 'NOT_FOUND', message: 'Not found' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function metadata(url: string): Response | undefined {
  if (url === '/api/business/me') {
    return jsonResponse(200, { success: true, data: { currency: 'BDT' } });
  }
  return undefined;
}

function renderPage() {
  return render(
    <ThemeBoundary>
      <NewOrderPage />
    </ThemeBoundary>,
  );
}

async function chooseCustomerAndProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Find the customer'), 'Nusrat');
  await user.click(await screen.findByRole('button', { name: /Nusrat Jahan/ }));
  expect(await screen.findByLabelText('Shipping address')).toHaveValue('12 Lake Road');

  await user.type(screen.getByLabelText('Add a product'), 'Cotton');
  await user.click(await screen.findByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('heading', { name: 'Cotton shirt' })).toBeVisible();
}

describe('NewOrderPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an order from a customer, a product, and the totals', async () => {
    const user = userEvent.setup();
    const fetchMock = installedFetch((url, init) => {
      if (url === '/api/orders' && init?.method === 'POST') {
        return jsonResponse(201, { success: true, data: makeOrder() });
      }
      if (url.startsWith('/api/customers?')) {
        return jsonResponse(200, {
          success: true,
          data: { items: [customer], nextCursor: null },
        });
      }
      if (url.startsWith('/api/products?')) {
        return jsonResponse(200, {
          success: true,
          data: { items: [product], nextCursor: null },
        });
      }
      return metadata(url);
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Create order' })).toBeVisible();
    await chooseCustomerAndProduct(user);

    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.type(screen.getByLabelText('Delivery fee'), '100');
    await user.type(screen.getByLabelText('Discount'), '50');

    expect(screen.getByText('5,050 BDT')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Create order' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/orders/order-1'));

    const postCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/orders' && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCall).toBeDefined();
    const init = postCall?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(init.body))).toEqual({
      customerId: customer.id,
      items: [{ productId: product.id, variantId: null, quantity: 2 }],
      source: 'DIRECT',
      deliveryFee: 100,
      discount: 50,
      shippingAddress: '12 Lake Road',
      notes: null,
      deliveryDeadline: null,
      confirmDuplicate: false,
    });
  });

  it('warns about a duplicate and reuses the same idempotency key when confirmed', async () => {
    const user = userEvent.setup();
    let posts = 0;
    const fetchMock = installedFetch((url, init) => {
      if (url === '/api/orders' && init?.method === 'POST') {
        posts += 1;
        if (posts === 1) {
          return jsonResponse(409, {
            error: 'DUPLICATE_ORDER',
            message: 'A matching order already exists.',
            existingOrder: {
              id: 'order-9',
              orderNumber: 'ORD-0009',
              status: 'PENDING',
              total: 5000,
              createdAt: created,
            },
          });
        }
        return jsonResponse(201, { success: true, data: makeOrder() });
      }
      if (url.startsWith('/api/customers?')) {
        return jsonResponse(200, {
          success: true,
          data: { items: [customer], nextCursor: null },
        });
      }
      if (url.startsWith('/api/products?')) {
        return jsonResponse(200, {
          success: true,
          data: { items: [product], nextCursor: null },
        });
      }
      return metadata(url);
    });

    renderPage();
    await screen.findByRole('heading', { name: 'Create order' });
    await chooseCustomerAndProduct(user);

    await user.click(screen.getByRole('button', { name: 'Create order' }));

    const dialog = await screen.findByRole('dialog', { name: 'This looks like a duplicate' });
    expect(within(dialog).getByText('ORD-0009')).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'View existing order' })).toHaveAttribute(
      'href',
      '/orders/order-9',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Create anyway' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/orders/order-1'));

    const postCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input) === '/api/orders' && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCalls).toHaveLength(2);
    const firstBody = JSON.parse(String((postCalls[0][1] as RequestInit).body)) as {
      confirmDuplicate: boolean;
    };
    const secondBody = JSON.parse(String((postCalls[1][1] as RequestInit).body)) as {
      confirmDuplicate: boolean;
    };
    expect(firstBody.confirmDuplicate).toBe(false);
    expect(secondBody.confirmDuplicate).toBe(true);
    expect(new Headers((postCalls[0][1] as RequestInit).headers).get('Idempotency-Key')).toBe(
      new Headers((postCalls[1][1] as RequestInit).headers).get('Idempotency-Key'),
    );
  });

  it('blocks submission until a customer and an item are chosen', async () => {
    const user = userEvent.setup();
    const fetchMock = installedFetch((url) => metadata(url));

    renderPage();
    await screen.findByRole('heading', { name: 'Create order' });

    await user.click(screen.getByRole('button', { name: 'Create order' }));

    const alerts = await screen.findAllByRole('alert');
    const text = alerts.map((alert) => alert.textContent).join(' ');
    expect(text).toContain('Choose an active customer.');
    expect(text).toContain('Add at least one product line with a valid quantity and price.');
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === '/api/orders' && (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });
});
