import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuth, setAuth } from '@/lib/auth-client';
import {
  businessSettingsCacheKey,
  writeBusinessSettingsCache,
} from '@/lib/business-settings-cache';
import { BusinessSettingsProvider, useBusinessSettings } from './business-settings-provider';

function Consumer() {
  const { currency, timezone, mounted } = useBusinessSettings();
  return <p data-testid="settings">{`${currency}|${timezone}|${mounted}`}</p>;
}

function renderProvider() {
  return render(
    <BusinessSettingsProvider>
      <Consumer />
    </BusinessSettingsProvider>,
  );
}

function profileResponse(currency: string, timezone: string): Response {
  return {
    ok: true,
    json: async () => ({ success: true, data: { currency, timezone } }),
  } as Response;
}

describe('BusinessSettingsProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuth();
  });

  it('uses the fallback without auth and does not fetch', () => {
    renderProvider();

    expect(screen.getByTestId('settings')).toHaveTextContent('|Asia/Dhaka|true');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('applies a cached entry before the profile request resolves', () => {
    setAuth({ accessToken: 'tok', businessId: 'biz-cache' });
    writeBusinessSettingsCache('biz-cache', { currency: 'USD', timezone: 'Europe/Berlin' });

    renderProvider();

    expect(screen.getByTestId('settings')).toHaveTextContent('USD|Europe/Berlin|true');
  });

  it('loads the profile once and writes the cache', async () => {
    setAuth({ accessToken: 'tok', businessId: 'biz-fetch' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => profileResponse('EUR', 'Europe/Paris')),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('settings')).toHaveTextContent('EUR|Europe/Paris|true'),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(businessSettingsCacheKey('biz-fetch'))).toBe(
      JSON.stringify({ currency: 'EUR', timezone: 'Europe/Paris' }),
    );
  });

  it('keeps the cache when the profile request fails', async () => {
    setAuth({ accessToken: 'tok', businessId: 'biz-fail' });
    writeBusinessSettingsCache('biz-fail', { currency: 'GBP', timezone: 'Europe/London' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response),
    );

    renderProvider();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('settings')).toHaveTextContent('GBP|Europe/London|true');
  });

  it('removes a malformed cache entry and uses the fallback', () => {
    setAuth({ accessToken: 'tok', businessId: 'biz-bad-cache' });
    window.localStorage.setItem(
      businessSettingsCacheKey('biz-bad-cache'),
      JSON.stringify({ currency: 'BDT', timezone: 'Mars/Olympus' }),
    );

    renderProvider();

    expect(screen.getByTestId('settings')).toHaveTextContent('|Asia/Dhaka|true');
    expect(window.localStorage.getItem(businessSettingsCacheKey('biz-bad-cache'))).toBeNull();
  });

  it('falls back to Asia/Dhaka when the profile timezone is invalid', async () => {
    setAuth({ accessToken: 'tok', businessId: 'biz-bad-profile' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => profileResponse('BDT', 'Mars/Olympus')),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('settings')).toHaveTextContent('BDT|Asia/Dhaka|true'),
    );
  });

  it('clears to the fallback and removes the cache on sign out', async () => {
    setAuth({ accessToken: 'tok', businessId: 'biz-signout' });
    writeBusinessSettingsCache('biz-signout', { currency: 'USD', timezone: 'America/New_York' });

    renderProvider();
    expect(screen.getByTestId('settings')).toHaveTextContent('USD|America/New_York|true');

    act(() => clearAuth());

    expect(screen.getByTestId('settings')).toHaveTextContent('|Asia/Dhaka|true');
    expect(window.localStorage.getItem(businessSettingsCacheKey('biz-signout'))).toBeNull();
  });

  it('loads a business after setAuth without remounting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => profileResponse('USD', 'America/Chicago')),
    );

    renderProvider();
    expect(screen.getByTestId('settings')).toHaveTextContent('|Asia/Dhaka|true');

    act(() => setAuth({ accessToken: 'tok', businessId: 'biz-late' }));

    await waitFor(() =>
      expect(screen.getByTestId('settings')).toHaveTextContent('USD|America/Chicago|true'),
    );
  });

  it('never reads another business cache', () => {
    writeBusinessSettingsCache('biz-other', { currency: 'EUR', timezone: 'Europe/Paris' });
    setAuth({ accessToken: 'tok', businessId: 'biz-mine' });

    renderProvider();

    expect(screen.getByTestId('settings')).toHaveTextContent('|Asia/Dhaka|true');
    expect(window.localStorage.getItem(businessSettingsCacheKey('biz-other'))).not.toBeNull();
  });
});
