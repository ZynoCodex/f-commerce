import type {
  CategoryCreateRequest,
  CategoryDto,
  CategoryUpdateRequest,
  ProductCreateRequest,
  ProductDto,
  ProductPageDto,
  ProductStockStatus,
  ProductUpdateRequest,
} from '@f-commerce/contracts';
import { apiFetch } from './auth-client';

export interface ProductQuery {
  q?: string;
  categoryId?: string;
  stockStatus?: ProductStockStatus;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface CatalogErrorBody {
  error?: string;
  message?: string;
  fields?: string[];
  existingProductId?: string;
  existingVariantId?: string | null;
  archived?: boolean;
  existingCategoryId?: string;
  productCount?: number;
}

/** A failed catalog request with the server's machine-readable details. */
export class CatalogApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly fields: string[],
    public readonly body: CatalogErrorBody,
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    const body: CatalogErrorBody = {
      error: typeof record.error === 'string' ? record.error : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      fields: Array.isArray(record.fields)
        ? record.fields.filter((field): field is string => typeof field === 'string')
        : undefined,
      existingProductId:
        typeof record.existingProductId === 'string' ? record.existingProductId : undefined,
      existingVariantId:
        typeof record.existingVariantId === 'string' ? record.existingVariantId : null,
      archived: typeof record.archived === 'boolean' ? record.archived : undefined,
      existingCategoryId:
        typeof record.existingCategoryId === 'string' ? record.existingCategoryId : undefined,
      productCount: typeof record.productCount === 'number' ? record.productCount : undefined,
    };

    throw new CatalogApiError(
      body.message ?? body.error ?? 'The request failed',
      response.status,
      body.error,
      body.fields ?? [],
      body,
    );
  }

  if (response.status === 204) return undefined as T;
  if (isRecord(payload) && 'data' in payload) return payload.data as T;
  return payload as T;
}

export function buildProductQuery(query: ProductQuery): string {
  const params = new URLSearchParams();
  const search = query.q?.trim();
  if (search) params.set('q', search);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.stockStatus) params.set('stockStatus', query.stockStatus);
  if (query.includeArchived) params.set('includeArchived', 'true');
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);

  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
}

export async function listProducts(query: ProductQuery): Promise<ProductPageDto> {
  const response = await apiFetch(`/api/products${buildProductQuery(query)}`);
  return parseResponse<ProductPageDto>(response);
}

export async function getProduct(id: string): Promise<ProductDto> {
  const response = await apiFetch(`/api/products/${id}`);
  return parseResponse<ProductDto>(response);
}

export async function createProduct(input: ProductCreateRequest): Promise<ProductDto> {
  const response = await apiFetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<ProductDto>(response);
}

export async function updateProduct(id: string, input: ProductUpdateRequest): Promise<ProductDto> {
  const response = await apiFetch(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<ProductDto>(response);
}

export async function archiveProduct(id: string, version: number): Promise<ProductDto> {
  const response = await apiFetch(`/api/products/${id}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return parseResponse<ProductDto>(response);
}

export async function restoreProduct(id: string, version: number): Promise<ProductDto> {
  const response = await apiFetch(`/api/products/${id}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return parseResponse<ProductDto>(response);
}

export async function deleteProduct(id: string, version: number): Promise<void> {
  const response = await apiFetch(`/api/products/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return parseResponse<void>(response);
}

export async function uploadProductImages(
  id: string,
  files: File[],
  version?: number,
): Promise<ProductDto> {
  const body = new FormData();
  for (const file of files) {
    body.append('images', file, file.name);
  }
  if (version !== undefined) body.append('version', String(version));

  const response = await apiFetch(`/api/products/${id}/images`, { method: 'POST', body });
  return parseResponse<ProductDto>(response);
}

export async function removeProductImage(
  id: string,
  index: number,
  version?: number,
): Promise<ProductDto> {
  const query = version === undefined ? '' : `?version=${version}`;
  const response = await apiFetch(`/api/products/${id}/images/${index}${query}`, {
    method: 'DELETE',
  });
  return parseResponse<ProductDto>(response);
}

export async function uploadVariantImage(
  id: string,
  variantIndex: number,
  file: File,
  version?: number,
): Promise<ProductDto> {
  const body = new FormData();
  body.append('image', file, file.name);
  if (version !== undefined) body.append('version', String(version));

  const response = await apiFetch(`/api/products/${id}/variants/${variantIndex}/image`, {
    method: 'POST',
    body,
  });
  return parseResponse<ProductDto>(response);
}

export async function listCategories(): Promise<CategoryDto[]> {
  const response = await apiFetch('/api/categories');
  return parseResponse<CategoryDto[]>(response);
}

export async function createCategory(input: CategoryCreateRequest): Promise<CategoryDto> {
  const response = await apiFetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<CategoryDto>(response);
}

export async function updateCategory(
  id: string,
  input: CategoryUpdateRequest,
): Promise<CategoryDto> {
  const response = await apiFetch(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<CategoryDto>(response);
}

export async function deleteCategory(id: string): Promise<void> {
  const response = await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
  return parseResponse<void>(response);
}

/** Currency only decorates prices, so a failure here leaves the numbers bare. */
export async function getBusinessCurrency(): Promise<string> {
  const response = await apiFetch('/api/business/me');
  if (!response.ok) return '';

  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.data) && typeof payload.data.currency === 'string') {
      return payload.data.currency;
    }
  } catch {
    return '';
  }

  return '';
}
