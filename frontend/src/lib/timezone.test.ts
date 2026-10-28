import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  formatBusinessDayLabel,
  getDateTimeFormatter,
  isValidTimeZone,
  normalizeTimeZone,
  todayInTimeZone,
} from './timezone';

afterEach(() => {
  vi.restoreAllMocks();
});

// 20:00 UTC is already the next calendar day in Dhaka (UTC+6).
const LATE_UTC = new Date('2026-10-25T20:00:00.000Z');
const MIDDAY_UTC = new Date('2026-10-25T12:00:00.000Z');

describe('isValidTimeZone', () => {
  it('accepts an IANA ID and UTC', () => {
    expect(isValidTimeZone('Asia/Dhaka')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects blank, offset, abbreviation, and unknown values', () => {
    for (const value of ['', '  ', '+06:00', 'BST', 'Mars/Olympus']) {
      expect(isValidTimeZone(value)).toBe(false);
    }
  });

  it('trims and canonicalizes a valid value', () => {
    expect(isValidTimeZone(' Asia/Dhaka ')).toBe(true);
    expect(normalizeTimeZone(' asia/dhaka ')).toBe('Asia/Dhaka');
    expect(normalizeTimeZone('Mars/Olympus')).toBe(DEFAULT_TIME_ZONE);
  });
});

describe('todayInTimeZone', () => {
  it('uses the business calendar day, not the UTC day', () => {
    expect(todayInTimeZone('Asia/Dhaka', LATE_UTC)).toBe('2026-10-26');
    expect(todayInTimeZone('UTC', LATE_UTC)).toBe('2026-10-25');
    expect(todayInTimeZone('America/New_York', LATE_UTC)).toBe('2026-10-25');
  });

  it('keeps both sides of a day boundary distinct', () => {
    expect(todayInTimeZone('Asia/Dhaka', MIDDAY_UTC)).toBe('2026-10-25');
    expect(todayInTimeZone('Asia/Dhaka', LATE_UTC)).toBe('2026-10-26');
  });

  it('falls back to Asia/Dhaka for a bad zone', () => {
    expect(todayInTimeZone('Mars/Olympus', LATE_UTC)).toBe('2026-10-26');
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Dhaka');
  });

  it('returns a padded YYYY-MM-DD day', () => {
    expect(todayInTimeZone('UTC', new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('formatBusinessDayLabel', () => {
  it('formats the business day in en-GB order', () => {
    expect(formatBusinessDayLabel('Asia/Dhaka', LATE_UTC)).toBe('Monday, 26 October');
    expect(formatBusinessDayLabel('UTC', LATE_UTC)).toBe('Sunday, 25 October');
  });

  it('falls back to Asia/Dhaka for a bad zone', () => {
    expect(formatBusinessDayLabel('Mars/Olympus', LATE_UTC)).toBe('Monday, 26 October');
  });
});

describe('daylight saving and leap days', () => {
  it('keeps the day boundary stable across a spring forward', () => {
    // 23:30 EST on 7 March, then 00:30 EST on 8 March, then 23:30 EDT on 8 March.
    // The cached formatter must apply the new offset at format time.
    expect(todayInTimeZone('America/New_York', new Date('2026-03-08T04:30:00.000Z'))).toBe(
      '2026-03-07',
    );
    expect(todayInTimeZone('America/New_York', new Date('2026-03-08T05:30:00.000Z'))).toBe(
      '2026-03-08',
    );
    expect(todayInTimeZone('America/New_York', new Date('2026-03-09T03:30:00.000Z'))).toBe(
      '2026-03-08',
    );
  });

  it('returns a leap day unchanged', () => {
    expect(todayInTimeZone('UTC', new Date('2028-02-29T12:00:00.000Z'))).toBe('2028-02-29');
  });
});

describe('formatter reuse', () => {
  it('constructs one validator and one formatter per zone', () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      return new RealDateTimeFormat(locale, options);
    } as typeof Intl.DateTimeFormat);

    todayInTimeZone('Europe/Berlin', LATE_UTC);
    todayInTimeZone('Europe/Berlin', LATE_UTC);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns the same formatter for one key and keeps different keys apart', () => {
    const first = getDateTimeFormatter('test|UTC', 'en-US', { timeZone: 'UTC' });
    const same = getDateTimeFormatter('test|UTC', 'en-US', { timeZone: 'UTC' });
    const other = getDateTimeFormatter('test|Asia/Dhaka', 'en-US', { timeZone: 'Asia/Dhaka' });

    expect(first).toBe(same);
    expect(first).not.toBe(other);
  });
});
