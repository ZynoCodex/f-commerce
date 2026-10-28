import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_ZONE, isValidTimeZone, todayInTimeZone } from './timezone.js';

describe('isValidTimeZone', () => {
  it('accepts an IANA ID and UTC', () => {
    expect(isValidTimeZone('Asia/Dhaka')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects blank, offset, bare name, abbreviation, unknown, and non-string values', () => {
    for (const value of [
      '',
      '  ',
      '+06:00',
      'Japan',
      'GMT',
      'CET',
      'BST',
      'Mars/Olympus',
      null,
      undefined,
      42,
    ]) {
      expect(isValidTimeZone(value)).toBe(false);
    }
  });

  it('keeps the fallback zone valid', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Dhaka');
    expect(isValidTimeZone(DEFAULT_TIME_ZONE)).toBe(true);
  });
});

describe('todayInTimeZone', () => {
  it('returns different days for two zones at the same instant', () => {
    // 20:00 UTC is already the next calendar day in Dhaka (UTC+6).
    const instant = new Date('2026-10-25T20:00:00.000Z');

    expect(todayInTimeZone('Asia/Dhaka', instant)).toBe('2026-10-26');
    expect(todayInTimeZone('UTC', instant)).toBe('2026-10-25');
    expect(todayInTimeZone('America/New_York', instant)).toBe('2026-10-25');
  });

  it('keeps the correct day on each side of a daylight saving change', () => {
    // New York springs forward on 2026-03-08 at 02:00 local time.
    expect(todayInTimeZone('America/New_York', new Date('2026-03-08T04:30:00.000Z'))).toBe(
      '2026-03-07',
    );
    expect(todayInTimeZone('America/New_York', new Date('2026-03-08T07:30:00.000Z'))).toBe(
      '2026-03-08',
    );

    // New York falls back on 2026-11-01 at 02:00 local time.
    expect(todayInTimeZone('America/New_York', new Date('2026-11-01T05:30:00.000Z'))).toBe(
      '2026-11-01',
    );
    expect(todayInTimeZone('America/New_York', new Date('2026-11-02T04:30:00.000Z'))).toBe(
      '2026-11-01',
    );
  });

  it('keeps a leap day and the day after distinct', () => {
    expect(todayInTimeZone('UTC', new Date('2028-02-29T12:00:00.000Z'))).toBe('2028-02-29');
    expect(todayInTimeZone('UTC', new Date('2028-03-01T00:00:00.000Z'))).toBe('2028-03-01');
  });

  it('falls back to Asia/Dhaka for an empty or invalid zone', () => {
    const instant = new Date('2026-10-25T20:00:00.000Z');

    expect(todayInTimeZone('Mars/Olympus', instant)).toBe('2026-10-26');
    expect(todayInTimeZone('', instant)).toBe('2026-10-26');
    expect(todayInTimeZone('+06:00', instant)).toBe('2026-10-26');
  });
});
