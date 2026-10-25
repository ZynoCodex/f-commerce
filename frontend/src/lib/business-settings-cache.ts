import { CurrencyEnum, TimezoneSchema } from '@f-commerce/contracts';

export interface CachedBusinessSettings {
  currency: string;
  timezone: string;
}

const CACHE_PREFIX = 'f-commerce:business-settings:v1:';

export function businessSettingsCacheKey(businessId: string): string {
  return `${CACHE_PREFIX}${businessId}`;
}

/** Read and validate one business's cached settings. A bad entry is removed. */
export function readBusinessSettingsCache(businessId: string): CachedBusinessSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(businessSettingsCacheKey(businessId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      removeBusinessSettingsCache(businessId);
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const currency = CurrencyEnum.safeParse(record.currency);
    const timezone = TimezoneSchema.safeParse(record.timezone);

    if (!currency.success || !timezone.success) {
      removeBusinessSettingsCache(businessId);
      return null;
    }

    return { currency: currency.data, timezone: timezone.data };
  } catch {
    removeBusinessSettingsCache(businessId);
    return null;
  }
}

/** Write only the two fields the console needs, under a versioned key. */
export function writeBusinessSettingsCache(
  businessId: string,
  settings: CachedBusinessSettings,
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      businessSettingsCacheKey(businessId),
      JSON.stringify({ currency: settings.currency, timezone: settings.timezone }),
    );
  } catch {
    // Storage can be unavailable or full; the profile fetch still works.
  }
}

export function removeBusinessSettingsCache(businessId: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(businessSettingsCacheKey(businessId));
  } catch {
    // Nothing to do when storage is unavailable.
  }
}
