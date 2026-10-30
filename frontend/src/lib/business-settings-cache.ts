import { CurrencyEnum, TimezoneSchema } from '@f-commerce/contracts';

export interface CachedBusinessSettings {
  currency: string;
  timezone: string;
}

const CACHE_PREFIX = 'f-commerce:business-settings:v1:';

/**
 * The last parsed entry. The provider reads this on every render, so an
 * unchanged raw value must not be parsed or validated again. The raw string is
 * part of the key, so a write in this tab or another one still invalidates it.
 */
let lastRead: { key: string; value: CachedBusinessSettings | null } | null = null;

export function businessSettingsCacheKey(businessId: string): string {
  return `${CACHE_PREFIX}${businessId}`;
}

function parseBusinessSettingsCache(raw: string | null): CachedBusinessSettings | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  const currency = CurrencyEnum.safeParse(record.currency);
  const timezone = TimezoneSchema.safeParse(record.timezone);

  if (!currency.success || !timezone.success) return null;

  return { currency: currency.data, timezone: timezone.data };
}

/**
 * Read and validate one business's cached settings without touching storage.
 * The provider calls this during render, so a malformed entry is ignored here
 * and pruned later by {@link pruneBusinessSettingsCache}.
 */
export function readBusinessSettingsCache(businessId: string): CachedBusinessSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(businessSettingsCacheKey(businessId));
    const key = `${businessId}|${raw ?? ''}`;
    if (lastRead?.key === key) return lastRead.value;

    const value = parseBusinessSettingsCache(raw);
    lastRead = { key, value };
    return value;
  } catch {
    return null;
  }
}

/** Remove an unreadable cache entry after render, never during it. */
export function pruneBusinessSettingsCache(businessId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(businessSettingsCacheKey(businessId));
    if (raw !== null && parseBusinessSettingsCache(raw) === null) {
      removeBusinessSettingsCache(businessId);
    }
  } catch {
    // Storage can be unavailable; there is nothing to prune then.
  }
}

/** Write only the two fields the console needs, under a versioned key. */
export function writeBusinessSettingsCache(
  businessId: string,
  settings: CachedBusinessSettings,
): void {
  lastRead = null;
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
  lastRead = null;
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(businessSettingsCacheKey(businessId));
  } catch {
    // Nothing to do when storage is unavailable.
  }
}
