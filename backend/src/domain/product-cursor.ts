/**
 * Opaque paging cursors for product lists. A cursor is base64url encoded JSON
 * carrying the last row's sort key plus the query shape it was built for, so
 * a cursor cannot be replayed against a different query, page size, or filter.
 */

import { StockStatus } from './entities/product.entity.js';
import { isUuid } from './uuid.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Clamp a requested page size into the allowed range [1, 50]. */
export function effectivePageSize(requested?: number): number {
  if (requested === undefined || Number.isNaN(requested)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_SIZE);
}

function encode(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(raw: string): Record<string, unknown> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface ProductCursorParams {
  name: string;
  id: string;
  q: string;
  limit: number;
  categoryId?: string | null;
  stockStatus?: StockStatus | null;
  includeArchived: boolean;
}

export function encodeProductCursor(payload: ProductCursorParams): string {
  return encode({
    name: payload.name,
    _id: payload.id,
    q: payload.q,
    limit: payload.limit,
    categoryId: payload.categoryId ?? null,
    stockStatus: payload.stockStatus ?? null,
    includeArchived: payload.includeArchived,
  });
}

export function decodeProductCursor(
  raw: string,
  query: string,
  limit: number,
  categoryId: string | null,
  stockStatus: StockStatus | null,
  includeArchived: boolean,
): ProductCursorParams | null {
  const parsed = decode(raw);
  if (!parsed) return null;

  const {
    name,
    _id,
    q,
    limit: cursorLimit,
    categoryId: cursorCat,
    stockStatus: cursorStock,
    includeArchived: cursorArchived,
  } = parsed;

  if (typeof name !== 'string' || typeof _id !== 'string' || !isUuid(_id)) return null;
  if (typeof q !== 'string' || typeof cursorLimit !== 'number') return null;
  if (q !== query || cursorLimit !== limit) return null;
  if (typeof includeArchived !== 'boolean' || cursorArchived !== includeArchived) return null;
  if (typeof cursorCat === 'string' ? !isUuid(cursorCat) : cursorCat !== null) return null;
  if (cursorStock !== null && !Object.values(StockStatus).includes(cursorStock as StockStatus))
    return null;
  if (cursorCat !== categoryId) return null;
  if (cursorStock !== stockStatus) return null;

  return {
    name,
    id: _id,
    q,
    limit: cursorLimit,
    categoryId: cursorCat as string | null,
    stockStatus: cursorStock as StockStatus | null,
    includeArchived: cursorArchived,
  };
}
