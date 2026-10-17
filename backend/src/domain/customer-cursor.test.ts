import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  decodeCustomerCursor,
  decodeOrderCursor,
  effectivePageSize,
  encodeCustomerCursor,
  encodeOrderCursor,
} from './customer-cursor.js';

function rawCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('effectivePageSize', () => {
  // covers AC-8: list pages default to 20 rows and never exceed 50
  it('uses the default when no size is requested', () => {
    expect(effectivePageSize()).toBe(DEFAULT_PAGE_SIZE);
    expect(effectivePageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('clamps sizes above the maximum', () => {
    expect(effectivePageSize(1000)).toBe(MAX_PAGE_SIZE);
  });

  it('clamps sizes below one up to one', () => {
    expect(effectivePageSize(0)).toBe(1);
    expect(effectivePageSize(-5)).toBe(1);
  });

  it('truncates fractional sizes', () => {
    expect(effectivePageSize(12.7)).toBe(12);
  });

  it('keeps sizes inside the range', () => {
    expect(effectivePageSize(30)).toBe(30);
  });
});

describe('customer search cursor', () => {
  // covers AC-8: cursors are opaque and bound to the query and page size they came from
  it('round-trips the sort key with the same query and limit', () => {
    const encoded = encodeCustomerCursor({ name: 'Rahim', id: 'c1', q: 'ra', limit: 20 });

    expect(decodeCustomerCursor(encoded, 'ra', 20)).toEqual({
      name: 'Rahim',
      id: 'c1',
      q: 'ra',
      limit: 20,
    });
  });

  it('rejects a cursor replayed against a different query', () => {
    const encoded = encodeCustomerCursor({ name: 'Rahim', id: 'c1', q: 'ra', limit: 20 });

    expect(decodeCustomerCursor(encoded, 'karim', 20)).toBeNull();
  });

  it('rejects a cursor replayed with a different page size', () => {
    const encoded = encodeCustomerCursor({ name: 'Rahim', id: 'c1', q: '', limit: 20 });

    expect(decodeCustomerCursor(encoded, '', 10)).toBeNull();
  });

  it('rejects input that is not base64url', () => {
    expect(decodeCustomerCursor('not valid!', '', 20)).toBeNull();
    expect(decodeCustomerCursor('abc+def/', '', 20)).toBeNull();
  });

  it('rejects base64url content that is not JSON', () => {
    const raw = Buffer.from('hello there', 'utf8').toString('base64url');

    expect(decodeCustomerCursor(raw, '', 20)).toBeNull();
  });

  it('rejects JSON that is not an object', () => {
    expect(decodeCustomerCursor(rawCursor([1, 2]), '', 20)).toBeNull();
    expect(decodeCustomerCursor(rawCursor(null), '', 20)).toBeNull();
    expect(decodeCustomerCursor(rawCursor('Rahim'), '', 20)).toBeNull();
  });

  it('rejects payloads with the wrong field types', () => {
    expect(
      decodeCustomerCursor(rawCursor({ name: 1, _id: 'c1', q: '', limit: 20 }), '', 20),
    ).toBeNull();
    expect(
      decodeCustomerCursor(rawCursor({ name: 'Rahim', _id: 'c1', q: '', limit: '20' }), '', 20),
    ).toBeNull();
    expect(decodeCustomerCursor(rawCursor({ name: 'Rahim', q: '', limit: 20 }), '', 20)).toBeNull();
  });
});

describe('order history cursor', () => {
  // covers AC-9: order history pages are keyed on createdAt and id
  it('round-trips the sort key with the same limit', () => {
    const createdAt = new Date('2026-03-01T10:00:00.000Z');
    const encoded = encodeOrderCursor({ createdAt, id: 'o1', limit: 20 });

    expect(decodeOrderCursor(encoded, 20)).toEqual({ createdAt, id: 'o1', limit: 20 });
  });

  it('rejects a cursor replayed with a different page size', () => {
    const encoded = encodeOrderCursor({
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      id: 'o1',
      limit: 20,
    });

    expect(decodeOrderCursor(encoded, 10)).toBeNull();
  });

  it('rejects an unparseable date', () => {
    expect(
      decodeOrderCursor(rawCursor({ createdAt: 'not-a-date', _id: 'o1', limit: 20 }), 20),
    ).toBeNull();
  });

  it('rejects a non-string date', () => {
    expect(
      decodeOrderCursor(rawCursor({ createdAt: 1714000000000, _id: 'o1', limit: 20 }), 20),
    ).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(decodeOrderCursor('not valid!', 20)).toBeNull();
    expect(decodeOrderCursor(Buffer.from('{', 'utf8').toString('base64url'), 20)).toBeNull();
  });
});
