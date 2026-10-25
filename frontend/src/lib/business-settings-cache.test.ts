import { beforeEach, describe, expect, it } from 'vitest';
import {
  businessSettingsCacheKey,
  readBusinessSettingsCache,
  removeBusinessSettingsCache,
  writeBusinessSettingsCache,
} from './business-settings-cache';

const BUSINESS_ID = 'biz-1';

describe('business settings cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keys each business separately', () => {
    expect(businessSettingsCacheKey('abc')).toBe('f-commerce:business-settings:v1:abc');
  });

  it('round-trips currency and timezone', () => {
    writeBusinessSettingsCache(BUSINESS_ID, { currency: 'USD', timezone: 'Europe/Berlin' });

    expect(readBusinessSettingsCache(BUSINESS_ID)).toEqual({
      currency: 'USD',
      timezone: 'Europe/Berlin',
    });
    expect(readBusinessSettingsCache('biz-2')).toBeNull();
  });

  it('stores only the two known fields', () => {
    window.localStorage.setItem(
      businessSettingsCacheKey(BUSINESS_ID),
      JSON.stringify({ currency: 'BDT', timezone: 'Asia/Dhaka', extra: 'ignored' }),
    );

    expect(readBusinessSettingsCache(BUSINESS_ID)).toEqual({
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
    });
  });

  it('removes a malformed entry instead of returning it', () => {
    for (const raw of [
      'not json',
      'null',
      '[]',
      JSON.stringify({ currency: 'JPY', timezone: 'Asia/Dhaka' }),
      JSON.stringify({ currency: 'BDT', timezone: 'Mars/Olympus' }),
    ]) {
      window.localStorage.setItem(businessSettingsCacheKey(BUSINESS_ID), raw);

      expect(readBusinessSettingsCache(BUSINESS_ID)).toBeNull();
      expect(window.localStorage.getItem(businessSettingsCacheKey(BUSINESS_ID))).toBeNull();
    }
  });

  it('removes an entry on request', () => {
    writeBusinessSettingsCache(BUSINESS_ID, { currency: 'BDT', timezone: 'Asia/Dhaka' });
    removeBusinessSettingsCache(BUSINESS_ID);

    expect(window.localStorage.getItem(businessSettingsCacheKey(BUSINESS_ID))).toBeNull();
  });
});
