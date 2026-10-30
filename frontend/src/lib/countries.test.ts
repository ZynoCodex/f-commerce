import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COUNTRIES,
  COUNTRY_NAMES,
  DEFAULT_COUNTRY,
  browserCountry,
  countryForTimeZone,
  countryName,
  timezoneCountryMap,
} from './countries';

// `browserCountry` asks the runtime for the browser zone with no arguments.
// Keep the real constructor for every other call so validation still uses the
// runtime's own timezone data.
function stubBrowserTimeZone(zone: string) {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
    locale?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (locale === undefined && options === undefined) {
      return { resolvedOptions: () => ({ timeZone: zone }) } as Intl.DateTimeFormat;
    }
    return new RealDateTimeFormat(locale, options);
  } as typeof Intl.DateTimeFormat);
}

describe('countryName', () => {
  it('maps an ISO code to the display name', () => {
    expect(countryName('BD')).toBe('Bangladesh');
    expect(countryName('US')).toBe('United States');
  });

  it('returns undefined for an unknown code', () => {
    expect(countryName('XX')).toBeUndefined();
  });
});

describe('countryForTimeZone', () => {
  it('maps an IANA zone to its primary country', () => {
    expect(countryForTimeZone('Asia/Dhaka')).toBe('Bangladesh');
    expect(countryForTimeZone('Europe/Berlin')).toBe('Germany');
    expect(countryForTimeZone('America/New_York')).toBe('United States');
  });

  it('maps legacy aliases that Intl still reports', () => {
    expect(countryForTimeZone('Asia/Calcutta')).toBe('India');
  });

  it('returns undefined for UTC and unknown zones', () => {
    expect(countryForTimeZone('UTC')).toBeUndefined();
    expect(countryForTimeZone('Mars/Olympus')).toBeUndefined();
  });
});

describe('browserCountry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the browser timezone', () => {
    stubBrowserTimeZone('Europe/Berlin');

    expect(browserCountry()).toBe('Germany');
  });

  it('falls back to the default country for an unmapped zone', () => {
    stubBrowserTimeZone('UTC');

    expect(browserCountry()).toBe(DEFAULT_COUNTRY);
  });
});

describe('country data', () => {
  it('keeps unique codes and names', () => {
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRY_NAMES).size).toBe(COUNTRY_NAMES.length);
  });

  it('includes the default country and sorts names', () => {
    expect(COUNTRY_NAMES).toContain(DEFAULT_COUNTRY);
    expect(COUNTRY_NAMES).toEqual([...COUNTRY_NAMES].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('maps every zone to a country the picker can show', () => {
    // A code missing from COUNTRIES would resolve to no name, so the country
    // would quietly fall back to the default instead of the real one.
    const known = new Set(COUNTRIES.map((country) => country.code));
    const zones = Object.keys(timezoneCountryMap());

    expect(zones.length).toBeGreaterThan(400);
    const unknown = zones.filter((zone) => {
      const code = timezoneCountryMap()[zone];
      return code === undefined || !known.has(code);
    });

    expect(unknown).toEqual([]);
  });
});
