import { describe, expect, it } from 'vitest';

import { formatDateOnly, isOverdue, localToday } from './catalog-format';

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

describe('local today', () => {
  // covers AC-19: the viewer's calendar day comes from their local clock
  it('reads the local calendar day with no timezone conversion', () => {
    // A local time near midnight keeps its own day in local terms.
    const nearMidnight = new Date(2026, 10, 5, 23, 30, 0);
    expect(localToday(nearMidnight)).toBe('2026-11-05');

    const earlyMorning = new Date(2026, 0, 1, 0, 15, 0);
    expect(localToday(earlyMorning)).toBe('2026-01-01');
  });

  // covers AC-19: a single digit month and day are padded
  it('pads a single digit month and day', () => {
    expect(localToday(new Date(2026, 2, 7, 12, 0, 0))).toBe('2026-03-07');
  });
});

describe('overdue derivation', () => {
  const now = new Date(2026, 10, 5, 12, 0, 0); // local 2026-11-05

  // covers AC-19: an active order past its promised day is overdue
  it('marks an active order past its promise as overdue', () => {
    expect(isOverdue('2026-11-04', 'PENDING', now)).toBe(true);
    expect(isOverdue('2026-11-04', 'CONFIRMED', now)).toBe(true);
    expect(isOverdue('2026-11-04', 'PROCESSING', now)).toBe(true);
    expect(isOverdue('2026-11-04', 'SHIPPED', now)).toBe(true);
  });

  // covers AC-19: a promise of today is not overdue, and a future promise is not either
  it('treats today and a future day as not overdue', () => {
    expect(isOverdue('2026-11-05', 'PENDING', now)).toBe(false);
    expect(isOverdue('2026-11-06', 'PENDING', now)).toBe(false);
  });

  // covers AC-19: a finished order is never overdue, and no promise is never overdue
  it('never marks a delivered, cancelled, or returned order, and never a missing promise', () => {
    expect(isOverdue('2026-11-04', 'DELIVERED', now)).toBe(false);
    expect(isOverdue('2026-11-04', 'CANCELLED', now)).toBe(false);
    expect(isOverdue('2026-11-04', 'RETURNED', now)).toBe(false);
    expect(isOverdue(null, 'PENDING', now)).toBe(false);
    expect(isOverdue(undefined, 'PENDING', now)).toBe(false);
  });
});
