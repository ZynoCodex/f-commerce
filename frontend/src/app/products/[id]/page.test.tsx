import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryDto, ProductDto } from '@f-commerce/contracts';

import { ThemeBoundary } from '@/components/theme/theme';
import { setAuth } from '@/lib/auth-client';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/product-1',
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useParams: () => ({ id: 'product-1' }),
}));

import ProductDetailPage from './page';

const category: CategoryDto = {
  id: 'cat-1',
  name: 'Tops',
  description: 'Shirts and blouses',
  version: 1,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

const variantImage = 'https://res.cloudinary.com/demo/image/upload/variant.png';

function makeProduct(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-1',
    name: 'Oxford shirt',
    description: 'A crisp cotton shirt',
    categoryId: category.id,
    categoryName: category.name,
    sku: 'SHIRT-1',
    price: 1200,
    cost: 700,
    stockCount: 0,
    lowStockThreshold: 5,
    availableStock: 3,
    stockStatus: 'lowStock',
    images: ['https://res.cloudinary.com/demo/image/upload/main.png'],
    options: [{ name: 'Size', values: ['S', 'M'] }],
    variants: [
      {
        combination: { Size: 'S' },
        sku: 'SHIRT-S',
        price: null,
        cost: null,
        stockCount: 2,
        imageUrl: variantImage,
        stockStatus: 'lowStock',
      },
      {
        combination: { Size: 'M' },
        sku: 'SHIRT-M',
        price: 1500,
        cost: 800,
        stockCount: 1,
        imageUrl: null,
        stockStatus: 'lowStock',
      },
    ],
    isArchived: false,
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

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

type HandlerResult = Response | Promise<Response> | undefined;

function installFetch(
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

function standardMetadata() {
  return (url: string): Response | undefined => {
    if (url === '/api/categories') {
      return jsonResponse(200, { success: true, data: [category] });
    }
    if (url === '/api/business/me') {
      return jsonResponse(200, { success: true, data: { currency: 'BDT' } });
    }
    return undefined;
  };
}

function renderPage() {
  return render(
    <ThemeBoundary>
      <ProductDetailPage />
    </ThemeBoundary>,
  );
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the product, stock, price, and variant images', async () => {
    const metadata = standardMetadata();
    installFetch((url) => {
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: makeProduct() });
      }
      return metadata(url);
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Oxford shirt' })).toBeVisible();
    expect(screen.getAllByText('Low stock').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,200 BDT').length).toBeGreaterThan(0);
    expect(screen.getByText('A crisp cotton shirt')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Oxford shirt image 1' })).toBeVisible();
    expect(screen.getAllByRole('img', { name: 'Oxford shirt, S' }).length).toBeGreaterThan(0);
  });

  it('removes a variant image by sending null for that variant', async () => {
    const user = userEvent.setup();
    let current = makeProduct();
    const fetchMock = installFetch((url, init) => {
      if (url === '/api/products/product-1' && init?.method === 'PATCH') {
        current = makeProduct({
          version: 2,
          variants: current.variants.map((variant, index) => ({
            ...variant,
            imageUrl: index === 0 ? null : variant.imageUrl,
          })),
        });
        return jsonResponse(200, { success: true, data: current });
      }
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: current });
      }
      return standardMetadata()(url);
    });

    renderPage();
    await screen.findByRole('heading', { name: 'Oxford shirt' });

    await user.click(screen.getAllByRole('button', { name: 'Remove image for S' })[0]);

    expect(await screen.findByText('Variant image removed')).toBeVisible();
    const patch = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/products/product-1' &&
        (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patch).toBeDefined();
    const body = JSON.parse(String((patch?.[1] as RequestInit).body)) as {
      version: number;
      variants: { imageUrl?: string | null }[];
    };
    expect(body.version).toBe(1);
    expect(body.variants[0]?.imageUrl).toBeNull();
    expect(body.variants[1]?.imageUrl).toBeUndefined();
    expect(screen.queryAllByRole('button', { name: 'Remove image for S' })).toHaveLength(0);
  });

  it('restores an archived product with its version', async () => {
    const user = userEvent.setup();
    let current = makeProduct({
      isArchived: true,
      archivedAt: '2026-10-19T10:00:00.000Z',
      version: 2,
    });
    const fetchMock = installFetch((url, init) => {
      if (url === '/api/products/product-1/restore' && init?.method === 'POST') {
        current = makeProduct({ version: 3 });
        return jsonResponse(200, { success: true, data: current });
      }
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: current });
      }
      return standardMetadata()(url);
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Oxford shirt' });
    expect(screen.getByRole('button', { name: 'Restore product' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit product' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore product' }));

    expect(await screen.findByText('Product restored')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Edit product' })).toBeVisible();

    const restoreCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/restore'));
    expect(restoreCall).toBeDefined();
    expect(JSON.parse(String((restoreCall?.[1] as RequestInit).body))).toEqual({ version: 2 });
  });

  it('archives a live product and shows the archived actions', async () => {
    const user = userEvent.setup();
    let current = makeProduct();
    const fetchMock = installFetch((url, init) => {
      if (url === '/api/products/product-1/archive' && init?.method === 'POST') {
        current = makeProduct({
          isArchived: true,
          archivedAt: '2026-10-19T10:00:00.000Z',
          version: 2,
        });
        return jsonResponse(200, { success: true, data: current });
      }
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: current });
      }
      return standardMetadata()(url);
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Oxford shirt' });
    await user.click(screen.getByRole('button', { name: 'Archive product' }));

    expect(await screen.findByText('Product archived')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Restore product' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete product' })).toBeVisible();

    const archiveCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/archive'));
    expect(JSON.parse(String((archiveCall?.[1] as RequestInit).body))).toEqual({ version: 1 });
  });

  it('keeps variant image URLs when an edit saves the matrix', async () => {
    const user = userEvent.setup();
    const current = makeProduct();
    const fetchMock = installFetch((url, init) => {
      if (url === '/api/products/product-1' && init?.method === 'PATCH') {
        return jsonResponse(200, { success: true, data: current });
      }
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: current });
      }
      return standardMetadata()(url);
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Oxford shirt' });
    await user.click(screen.getByRole('button', { name: 'Edit product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit product' });
    await within(dialog).findByRole('option', { name: 'Tops' });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Product updated')).toBeVisible();

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/products/product-1' &&
        (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(String((patchCall?.[1] as RequestInit).body)) as {
      version: number;
      variants: { imageUrl?: string; combination: Record<string, string> }[];
    };
    expect(body.version).toBe(1);
    expect(body.variants[0].combination).toEqual({ Size: 'S' });
    expect(body.variants[0].imageUrl).toBe(variantImage);
    expect(body.variants[1].imageUrl).toBeUndefined();
  });

  it('shows a not-found state for a missing product', async () => {
    installFetch((url) => {
      if (url === '/api/products/product-1') {
        return jsonResponse(404, { error: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
      }
      return standardMetadata()(url);
    });

    renderPage();

    expect(await screen.findByText('Product not found')).toBeVisible();
    expect(screen.getByRole('link', { name: /back to products/i })).toHaveAttribute(
      'href',
      '/products',
    );
  });

  it('deletes an archived product and returns to the catalog', async () => {
    const user = userEvent.setup();
    const deleted = makeProduct({
      isArchived: true,
      archivedAt: '2026-10-19T10:00:00.000Z',
      version: 2,
    });
    const fetchMock = installFetch((url, init) => {
      if (url === '/api/products/product-1' && init?.method === 'DELETE') {
        return noContentResponse();
      }
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: deleted });
      }
      return standardMetadata()(url);
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Oxford shirt' });
    await user.click(screen.getByRole('button', { name: 'Delete product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete product?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/products'));

    const deleteCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/products/product-1' &&
        (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(JSON.parse(String((deleteCall?.[1] as RequestInit).body))).toEqual({ version: 2 });
  });

  it('reloads after a timed-out archive to confirm the change', async () => {
    const user = userEvent.setup();
    let current = makeProduct();
    installFetch((url, init) => {
      if (url === '/api/products/product-1/archive' && init?.method === 'POST') {
        current = makeProduct({
          isArchived: true,
          archivedAt: '2026-10-19T10:00:00.000Z',
          version: 2,
        });
        return Promise.reject(new DOMException('Request timed out', 'TimeoutError'));
      }
      if (url === '/api/products/product-1') {
        return jsonResponse(200, { success: true, data: current });
      }
      return standardMetadata()(url);
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Oxford shirt' });
    await user.click(screen.getByRole('button', { name: 'Archive product' }));

    expect(await screen.findByText(/timed out/i)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Restore product' })).toBeVisible();
  });
});
