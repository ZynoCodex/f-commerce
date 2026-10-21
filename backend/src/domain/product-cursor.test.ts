import { describe, expect, it } from 'vitest';
import { StockStatus } from './entities/product.entity.js';
import { decodeProductCursor, encodeProductCursor } from './product-cursor.js';

const PRODUCT_ID = '00000000-0000-0000-0000-0000000000a1';
const CATEGORY_ID = '00000000-0000-0000-0000-0000000000b2';

const validPayload = {
  name: 'Tee',
  _id: PRODUCT_ID,
  q: 'tee',
  limit: 20,
  categoryId: null,
  stockStatus: null,
  includeArchived: false,
};

function encodeRaw(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(raw: string) {
  return decodeProductCursor(raw, 'tee', 20, null, null, false);
}

describe('product cursors', () => {
  it('round trips a cursor with its query shape', () => {
    const encoded = encodeProductCursor({
      name: 'Tee',
      id: PRODUCT_ID,
      q: 'tee',
      limit: 20,
      categoryId: CATEGORY_ID,
      stockStatus: StockStatus.IN_STOCK,
      includeArchived: true,
    });

    expect(
      decodeProductCursor(encoded, 'tee', 20, CATEGORY_ID, StockStatus.IN_STOCK, true),
    ).toEqual({
      name: 'Tee',
      id: PRODUCT_ID,
      q: 'tee',
      limit: 20,
      categoryId: CATEGORY_ID,
      stockStatus: StockStatus.IN_STOCK,
      includeArchived: true,
    });
  });

  it.each(['name', '_id', 'q', 'limit', 'categoryId', 'stockStatus', 'includeArchived'])(
    'rejects a decoded cursor that is missing %s',
    (field) => {
      const payload: Record<string, unknown> = { ...validPayload };
      delete payload[field];

      expect(decode(encodeRaw(payload))).toBeNull();
    },
  );

  it.each([
    ['name', 12],
    ['_id', 'not-a-uuid'],
    ['q', 12],
    ['limit', '20'],
    ['categoryId', 'not-a-uuid'],
    ['stockStatus', 'unknown'],
    ['includeArchived', 'false'],
  ])('rejects a decoded cursor whose %s has the wrong type', (field, value) => {
    const payload: Record<string, unknown> = { ...validPayload, [field]: value };

    expect(decode(encodeRaw(payload))).toBeNull();
  });

  it('rejects a cursor replayed against a different query or page size', () => {
    const raw = encodeRaw(validPayload);

    expect(decodeProductCursor(raw, 'other', 20, null, null, false)).toBeNull();
    expect(decodeProductCursor(raw, 'tee', 50, null, null, false)).toBeNull();
    expect(decodeProductCursor(raw, 'tee', 20, null, null, true)).toBeNull();
  });

  it('rejects malformed base64url and non-object JSON', () => {
    expect(decode('not a cursor')).toBeNull();
    expect(decode(encodeRaw({ value: 'valid' }))).toBeNull();
    expect(decode(Buffer.from('[]', 'utf8').toString('base64url'))).toBeNull();
  });
});
