import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  healthResponseSchema,
  BusinessProfileUpdateSchema,
  DraftSaveSchema,
  BusinessProfileSchema,
  TimezoneSchema,
  resolveTimeZone,
} from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contracts scaffold', () => {
  it('parses the health response', () => {
    expect(
      healthResponseSchema.parse({
        success: true,
        data: { status: 'ok' },
        message: 'Backend is healthy',
      }),
    ).toMatchObject({ success: true });
  });

  it('rejects a health response with the wrong status', () => {
    expect(() =>
      healthResponseSchema.parse({
        success: true,
        data: { status: 'down' },
        message: 'Backend is healthy',
      }),
    ).toThrow();
  });
});

describe('BusinessProfileUpdateSchema', () => {
  it('does not reset currency to a default on partial update (blocker fix)', () => {
    const result = BusinessProfileUpdateSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
    // currency should be absent, not defaulted to 'BDT'
    expect(result.data?.currency).toBeUndefined();
  });

  it('accepts currency when provided', () => {
    const result = BusinessProfileUpdateSchema.safeParse({ currency: 'USD' });
    expect(result.success).toBe(true);
    expect(result.data?.currency).toBe('USD');
  });

  it('rejects an invalid currency on partial update', () => {
    const result = BusinessProfileUpdateSchema.safeParse({ currency: 'JPY' });
    expect(result.success).toBe(false);
  });

  it('accepts a timezone on partial update and canonicalizes it', () => {
    const result = BusinessProfileUpdateSchema.safeParse({ timezone: 'asia/dhaka' });
    expect(result.success).toBe(true);
    expect(result.data?.timezone).toBe('Asia/Dhaka');
  });

  it('rejects an invalid timezone on partial update', () => {
    expect(BusinessProfileUpdateSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
  });

  it('makes all fields optional', () => {
    const result = BusinessProfileUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('DraftSaveSchema', () => {
  it('validates name value as a non-empty string', () => {
    expect(DraftSaveSchema.safeParse({ field: 'name', value: '' }).success).toBe(false);
    expect(DraftSaveSchema.safeParse({ field: 'name', value: 'Biz' }).success).toBe(true);
  });

  it('validates currency value against CurrencyEnum', () => {
    expect(
      DraftSaveSchema.safeParse({ field: 'currency', value: 'INVALID_CURRENCY' }).success,
    ).toBe(false);
    expect(DraftSaveSchema.safeParse({ field: 'currency', value: 'USD' }).success).toBe(true);
  });

  it('validates timezone value against TimezoneSchema', () => {
    expect(DraftSaveSchema.safeParse({ field: 'timezone', value: 'Mars/Olympus' }).success).toBe(
      false,
    );
    const parsed = DraftSaveSchema.safeParse({ field: 'timezone', value: 'asia/dhaka' });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.value).toBe('Asia/Dhaka');
  });

  it('requires draft address street and country but allows an incomplete city', () => {
    const missingCity = { street: '123 Main', country: 'Bangladesh' };
    expect(DraftSaveSchema.safeParse({ field: 'address', value: missingCity }).success).toBe(false);

    const partialAddress = { street: '50 Draft Lane', city: '', country: 'Bangladesh' };
    expect(DraftSaveSchema.safeParse({ field: 'address', value: partialAddress }).success).toBe(
      true,
    );

    const goodAddress = { street: '123 Main', city: 'Dhaka', country: 'Bangladesh' };
    expect(DraftSaveSchema.safeParse({ field: 'address', value: goodAddress }).success).toBe(true);
  });

  it('validates logoUrl value as a URL or empty string', () => {
    expect(DraftSaveSchema.safeParse({ field: 'logoUrl', value: 'not-a-url' }).success).toBe(false);
    expect(
      DraftSaveSchema.safeParse({ field: 'logoUrl', value: 'https://example.com/logo.png' })
        .success,
    ).toBe(true);
    expect(DraftSaveSchema.safeParse({ field: 'logoUrl', value: '' }).success).toBe(true);
  });

  // covers review blocker #2: unknown fields are rejected by the discriminated union
  it('rejects unknown field values to prevent field injection', () => {
    expect(DraftSaveSchema.safeParse({ field: 'isAdmin', value: true }).success).toBe(false);
    expect(DraftSaveSchema.safeParse({ field: '$where', value: '1' }).success).toBe(false);
    expect(DraftSaveSchema.safeParse({ field: 'members', value: [] }).success).toBe(false);
  });

  it('rejects when field is missing entirely', () => {
    expect(DraftSaveSchema.safeParse({ value: 'something' }).success).toBe(false);
  });

  it('rejects when value is missing', () => {
    expect(DraftSaveSchema.safeParse({ field: 'name' }).success).toBe(false);
  });
});

describe('resolveTimeZone', () => {
  it('returns the canonical ID, or null when the runtime rejects the value', () => {
    expect(resolveTimeZone(' asia/dhaka ')).toBe('Asia/Dhaka');
    expect(resolveTimeZone('UTC')).toBe('UTC');
    expect(resolveTimeZone('BST')).toBeNull();
    expect(resolveTimeZone('Mars/Olympus')).toBeNull();
  });

  it('rejects blank, fixed offset, bare name, and over long values before resolving', () => {
    for (const value of ['', '   ', '+06:00', 'Japan', 'GMT', 'CET', 'A'.repeat(65)]) {
      expect(resolveTimeZone(value)).toBeNull();
    }
  });
});

describe('TimezoneSchema', () => {
  it('accepts a recognized IANA timezone and trims surrounding whitespace', () => {
    expect(TimezoneSchema.parse(' Asia/Dhaka ')).toBe('Asia/Dhaka');
  });

  it('accepts UTC', () => {
    expect(TimezoneSchema.parse('UTC')).toBe('UTC');
  });

  it('returns the canonical ID the runtime resolves', () => {
    expect(TimezoneSchema.parse('asia/dhaka')).toBe('Asia/Dhaka');
    expect(TimezoneSchema.parse('Asia/Kolkata')).toBe(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata' }).resolvedOptions().timeZone,
    );
  });

  it('stores an IANA alias in the canonical form the runtime reports', () => {
    // ICU data decides whether Calcutta or Kolkata is the preferred ID, so
    // follow the runtime for the alias instead of forcing a specific collapse.
    const canonical = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Calcutta',
    }).resolvedOptions().timeZone;

    expect(TimezoneSchema.parse('Asia/Calcutta')).toBe(canonical);
  });

  it('constructs the runtime formatter once per parse', () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      return new RealDateTimeFormat(locale, options);
    } as typeof Intl.DateTimeFormat);

    TimezoneSchema.parse('Asia/Kolkata');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rejects blank, whitespace only, fixed offsets, bare names, abbreviations, unknown zones, and long values', () => {
    for (const value of [
      '',
      '   ',
      '+06:00',
      'Japan',
      'GMT',
      'CET',
      'BST',
      'Mars/Olympus',
      'A'.repeat(65),
    ]) {
      expect(TimezoneSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('BusinessProfileSchema (full onboarding payload)', () => {
  // covers AC-2: shared schema enforces all required fields for onboarding completion

  it('accepts a complete valid business profile', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Maya Traders',
      currency: 'USD',
      timezone: 'Asia/Dhaka',
      address: { street: '1 Main St', city: 'Dhaka', country: 'Bangladesh' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when timezone is missing', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Maya Traders',
      currency: 'USD',
      address: { street: '1 Main St', city: 'Dhaka', country: 'Bangladesh' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid timezone', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Maya Traders',
      currency: 'USD',
      timezone: 'Mars/Olympus',
      address: { street: '1 Main St', city: 'Dhaka', country: 'Bangladesh' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when name is empty', () => {
    const result = BusinessProfileSchema.safeParse({
      name: '',
      currency: 'USD',
      timezone: 'Asia/Dhaka',
      address: { street: '1 St', city: 'City', country: 'BD' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when currency is not in the allowed enum', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Biz',
      currency: 'JPY',
      timezone: 'Asia/Dhaka',
      address: { street: '1 St', city: 'City', country: 'JP' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when address is missing', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Biz',
      currency: 'USD',
      timezone: 'Asia/Dhaka',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when address is missing required city field', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Biz',
      currency: 'USD',
      timezone: 'Asia/Dhaka',
      address: { street: '1 St', country: 'US' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts logoUrl as an empty string (no logo uploaded)', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Biz',
      currency: 'USD',
      timezone: 'Asia/Dhaka',
      logoUrl: '',
      address: { street: '1 St', city: 'City', country: 'US' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects logoUrl when it is not a valid URL and not empty', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Biz',
      currency: 'USD',
      timezone: 'Asia/Dhaka',
      logoUrl: 'not-a-url',
      address: { street: '1 St', city: 'City', country: 'US' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts all four supported currencies', () => {
    for (const currency of ['BDT', 'USD', 'EUR', 'GBP'] as const) {
      const result = BusinessProfileSchema.safeParse({
        name: 'Biz',
        currency,
        timezone: 'Asia/Dhaka',
        address: { street: '1 St', city: 'City', country: 'BD' },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional address fields region and postalCode', () => {
    const result = BusinessProfileSchema.safeParse({
      name: 'Biz',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
      address: {
        street: '1 St',
        city: 'Dhaka',
        region: 'Dhaka Division',
        postalCode: '1000',
        country: 'Bangladesh',
      },
    });
    expect(result.success).toBe(true);
  });
});
