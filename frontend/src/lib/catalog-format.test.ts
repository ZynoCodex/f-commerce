import { describe, expect, it } from 'vitest';

import { formatDateOnly, formatDateTime, formatMoney, isOverdue } from './catalog-format';

describe('money and date time formatting', () => {
  // covers AC-15 and AC-16: whole amounts print with the business currency, and absent money prints a dash
  it('formats whole amounts with an optional currency', () => {
    expect(formatMoney(9350, 'BDT')).toBe('9,350 BDT');
    expect(formatMoney(0, '')).toBe('0');
    expect(formatMoney(null, 'BDT')).toBe('—');
    expect(formatMoney(undefined, 'BDT')).toBe('—');
  });

  // covers AC-8: a timestamp is rendered in the business zone, not the browser zone
  it('formats a timestamp in the requested zone', () => {
    const lateUtc = '2026-10-25T20:00:00.000Z';

    expect(formatDateTime(lateUtc, 'Asia/Dhaka')).toContain('Oct 26, 2026');
    expect(formatDateTime(lateUtc, 'UTC')).toContain('Oct 25, 2026');
    expect(formatDateTime(lateUtc, 'America/New_York')).toContain('Oct 25, 2026');
  });

  // covers AC-8: a bad zone falls back to Asia/Dhaka instead of throwing
  it('falls back to Asia/Dhaka for an invalid zone', () => {
    const value = '2026-10-25T20:00:00.000Z';

    expect(formatDateTime(value, 'Mars/Olympus')).toBe(formatDateTime(value, 'Asia/Dhaka'));
  });

  // covers AC-8: an unexpected timestamp passes through unchanged
  it('passes an invalid timestamp through', () => {
    expect(formatDateTime('not-a-date', 'Asia/Dhaka')).toBe('not-a-date');
  });
});

describe('date only formatter', () => {
  // covers AC-19: the stored day is shown as a calendar date with no timezone shift
  it('formats a stored YYYY-MM-DD value without shifting the day', () => {
    expect(formatDateOnly('2026-11-05')).toBe('Nov 5, 2026');
    expect(formatDateOnly('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDateOnly('2026-12-31')).toBe('Dec 31, 2026');
  });

  // covers AC-19: an absent promise has no display value
  it('returns null for a null or empty value', () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
    expect(formatDateOnly('')).toBeNull();
  });

  // covers AC-19: a value that is not a plain date is passed through unchanged
  it('passes an unexpected value through unchanged', () => {
    expect(formatDateOnly('not-a-date')).toBe('not-a-date');
  });
});

describe('overdue derivation', () => {
  const today = '2026-11-05';

  // covers AC-9: an active order past the business day is overdue
  it('marks an active order past its promise as overdue', () => {
    expect(isOverdue('2026-11-04', 'PENDING', today)).toBe(true);
    expect(isOverdue('2026-11-04', 'CONFIRMED', today)).toBe(true);
    expect(isOverdue('2026-11-04', 'PROCESSING', today)).toBe(true);
    expect(isOverdue('2026-11-04', 'SHIPPED', today)).toBe(true);
  });

  // covers AC-9: a promise of today is not overdue, and a future promise is not either
  it('treats today and a future day as not overdue', () => {
    expect(isOverdue('2026-11-05', 'PENDING', today)).toBe(false);
    expect(isOverdue('2026-11-06', 'PENDING', today)).toBe(false);
  });

  // covers AC-9: a finished order is never overdue, and no promise is never overdue
  it('never marks a delivered, cancelled, or returned order, and never a missing promise', () => {
    expect(isOverdue('2026-11-04', 'DELIVERED', today)).toBe(false);
    expect(isOverdue('2026-11-04', 'CANCELLED', today)).toBe(false);
    expect(isOverdue('2026-11-04', 'RETURNED', today)).toBe(false);
    expect(isOverdue(null, 'PENDING', today)).toBe(false);
    expect(isOverdue(undefined, 'PENDING', today)).toBe(false);
  });
});
