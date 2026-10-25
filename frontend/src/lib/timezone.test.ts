import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  formatBusinessDayLabel,
  isValidTimeZone,
  todayInTimeZone,
} from './timezone';

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
