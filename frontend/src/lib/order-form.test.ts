import { describe, expect, it } from 'vitest';

import {
  MAX_LINE_QUANTITY,
  MAX_MONEY_INPUT,
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUS_LABEL,
  computeOrderTotals,
  effectiveLinePrice,
  isOrderEditable,
  lineSubtotal,
  nextOrderStatuses,
  orderSourceLabel,
  parseMoneyInput,
  parseQuantityInput,
  variantLabel,
  type OrderLineState,
} from './order-form';

function line(overrides: Partial<OrderLineState> = {}): OrderLineState {
  return {
    key: 'line-1',
    productId: 'product-1',
    variantId: null,
    productName: 'Cotton shirt',
    variantLabel: null,
    quantity: '2',
    unitPrice: '',
    productPrice: 2500,
    defaultPrice: 2500,
    variants: [],
    ...overrides,
  };
}

describe('order workflow helpers', () => {
  // covers AC-14: the list opens on the four working statuses
  it('keeps the four active statuses in workflow order', () => {
    expect(ORDER_ACTIVE_STATUSES).toEqual(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED']);
  });

  it('follows the allowed status transitions', () => {
    expect(nextOrderStatuses('PENDING')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(nextOrderStatuses('CONFIRMED')).toEqual(['PROCESSING', 'CANCELLED']);
    expect(nextOrderStatuses('PROCESSING')).toEqual(['SHIPPED', 'CANCELLED']);
    expect(nextOrderStatuses('SHIPPED')).toEqual(['DELIVERED', 'RETURNED']);
    expect(nextOrderStatuses('DELIVERED')).toEqual(['RETURNED']);
    expect(nextOrderStatuses('CANCELLED')).toEqual([]);
    expect(nextOrderStatuses('RETURNED')).toEqual([]);
  });

  it('allows edits only while the order is pending or confirmed', () => {
    expect(isOrderEditable('PENDING')).toBe(true);
    expect(isOrderEditable('CONFIRMED')).toBe(true);
    expect(isOrderEditable('PROCESSING')).toBe(false);
    expect(isOrderEditable('SHIPPED')).toBe(false);
    expect(isOrderEditable('DELIVERED')).toBe(false);
    expect(isOrderEditable('CANCELLED')).toBe(false);
    expect(isOrderEditable('RETURNED')).toBe(false);
  });

  it('labels every status and source', () => {
    expect(Object.keys(ORDER_STATUS_LABEL)).toHaveLength(7);
    expect(ORDER_STATUS_LABEL.PENDING).toBe('Pending');
    expect(ORDER_STATUS_LABEL.RETURNED).toBe('Returned');
    expect(orderSourceLabel('FACEBOOK')).toBe('Facebook');
    expect(orderSourceLabel('WHATSAPP')).toBe('WhatsApp');
    expect(orderSourceLabel(null)).toBe('Not recorded');
  });
});

describe('variantLabel', () => {
  it('follows the option order and skips missing values', () => {
    expect(variantLabel(['Size', 'Color'], { Color: 'Blue', Size: 'M' })).toBe('M / Blue');
    expect(variantLabel(['Size', 'Color'], { Color: 'Blue' })).toBe('Blue');
  });

  it('falls back to stored values and returns null when empty', () => {
    expect(variantLabel([], { Size: 'S' })).toBe('S');
    expect(variantLabel([], {})).toBeNull();
  });
});

describe('numeric input parsing', () => {
  it('parses whole amounts and treats a blank optional amount as zero', () => {
    expect(parseMoneyInput('0', false)).toBe(0);
    expect(parseMoneyInput(' 1250 ', false)).toBe(1250);
    expect(parseMoneyInput('', true)).toBe(0);
    expect(parseMoneyInput('', false)).toBeNull();
  });

  it('rejects negative, fractional, oversized, and non-numeric amounts', () => {
    expect(parseMoneyInput('-1', false)).toBeNull();
    expect(parseMoneyInput('1.5', false)).toBeNull();
    expect(parseMoneyInput(String(MAX_MONEY_INPUT + 1), false)).toBeNull();
    expect(parseMoneyInput('abc', false)).toBeNull();
  });

  it('parses quantities within the line limits', () => {
    expect(parseQuantityInput('1')).toBe(1);
    expect(parseQuantityInput(String(MAX_LINE_QUANTITY))).toBe(MAX_LINE_QUANTITY);
    expect(parseQuantityInput('0')).toBeNull();
    expect(parseQuantityInput('1.5')).toBeNull();
    expect(parseQuantityInput(String(MAX_LINE_QUANTITY + 1))).toBeNull();
    expect(parseQuantityInput('')).toBeNull();
  });

  it('uses an override only when the unit price field is filled', () => {
    expect(effectiveLinePrice(line())).toBe(2500);
    expect(effectiveLinePrice(line({ unitPrice: '1800' }))).toBe(1800);
    expect(effectiveLinePrice(line({ unitPrice: ' ' }))).toBe(2500);
    expect(effectiveLinePrice(line({ unitPrice: '-2' }))).toBeNull();
    expect(lineSubtotal(line({ quantity: '3', unitPrice: '1800' }))).toBe(5400);
  });
});

describe('computeOrderTotals', () => {
  it('sums valid lines and applies delivery and discount', () => {
    const totals = computeOrderTotals(
      [line({ quantity: '2', unitPrice: '900' }), line({ key: 'line-2', quantity: '1' })],
      '100',
      '50',
    );

    expect(totals).toEqual({
      subtotal: 4300,
      deliveryFee: 100,
      discount: 50,
      total: 4350,
      everyLineValid: true,
    });
  });

  it('keeps partial totals but flags an invalid line', () => {
    const totals = computeOrderTotals([line(), line({ key: 'line-2', quantity: '' })], '', '');

    expect(totals).toEqual({
      subtotal: 5000,
      deliveryFee: 0,
      discount: 0,
      total: 5000,
      everyLineValid: false,
    });
  });

  it('treats invalid amounts as zero so the preview never shows NaN', () => {
    const totals = computeOrderTotals([line()], 'abc', '5');

    expect(totals.deliveryFee).toBe(0);
    expect(totals.discount).toBe(5);
    expect(totals.total).toBe(4995);
  });

  // covers AC-4: an empty form previews zero rather than a broken total
  it('previews zero for an order with no lines', () => {
    expect(computeOrderTotals([], '', '')).toEqual({
      subtotal: 0,
      deliveryFee: 0,
      discount: 0,
      total: 0,
      everyLineValid: true,
    });
  });

  // covers AC-4: a bad quantity or price never becomes a line total
  it('returns no line total when the quantity or price is invalid', () => {
    expect(lineSubtotal(line({ quantity: '0' }))).toBeNull();
    expect(lineSubtotal(line({ unitPrice: '-1' }))).toBeNull();
    expect(lineSubtotal(line({ unitPrice: '0' }))).toBe(0);
  });
});
