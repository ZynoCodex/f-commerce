/**
 * Opaque paging cursors for customer lists. A cursor is base64url encoded JSON
 * carrying the last row's sort key plus the query shape it was built for, so a
 * cursor cannot be replayed against a different query or page size.
 */

import { isUuid } from './uuid.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Clamp a requested page size into the allowed range. */
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

export interface CustomerCursorPayload {
  name: string;
  id: string;
  q: string;
  limit: number;
}

export function encodeCustomerCursor(payload: CustomerCursorPayload): string {
  return encode({ name: payload.name, _id: payload.id, q: payload.q, limit: payload.limit });
}

/**
 * Decode a search cursor. Returns null when the cursor is malformed or was
 * built for a different query or page size.
 */
export function decodeCustomerCursor(
  raw: string,
  query: string,
  limit: number,
): CustomerCursorPayload | null {
  const parsed = decode(raw);
  if (!parsed) return null;
  const { name, _id, q, limit: cursorLimit } = parsed;
  if (typeof name !== 'string' || typeof _id !== 'string' || !isUuid(_id)) return null;
  if (typeof q !== 'string' || typeof cursorLimit !== 'number') return null;
  if (q !== query || cursorLimit !== limit) return null;
  return { name, id: _id, q, limit: cursorLimit };
}

export interface OrderCursorPayload {
  createdAt: Date;
  id: string;
  limit: number;
}

export function encodeOrderCursor(payload: OrderCursorPayload): string {
  return encode({
    createdAt: payload.createdAt.toISOString(),
    _id: payload.id,
    limit: payload.limit,
  });
}

/**
 * Decode an order history cursor. Returns null when the cursor is malformed or
 * was built for a different page size.
 */
export function decodeOrderCursor(raw: string, limit: number): OrderCursorPayload | null {
  const parsed = decode(raw);
  if (!parsed) return null;
  const { createdAt, _id, limit: cursorLimit } = parsed;
  if (typeof createdAt !== 'string' || typeof _id !== 'string' || !isUuid(_id)) return null;
  if (typeof cursorLimit !== 'number' || cursorLimit !== limit) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return { createdAt: date, id: _id, limit: cursorLimit };
}
