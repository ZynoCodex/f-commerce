export const DEFAULT_TIME_ZONE = 'Asia/Dhaka';

/**
 * A bare `UTC` or an `Area/Location` style IANA ID. This rejects fixed offsets
 * such as `+06:00` and abbreviations such as `BST`, both of which the runtime
 * would otherwise accept as legacy aliases.
 */
const IANA_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+$/;

/**
 * True only for an IANA timezone ID the runtime accepts. Fixed offsets and
 * abbreviations do not survive daylight saving changes, so they are rejected.
 */
export function isValidTimeZone(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const zone = value.trim();
  if (zone.length === 0 || zone.length > 64) return false;
  if (zone !== 'UTC' && !IANA_ID_PATTERN.test(zone)) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The business's calendar day as `YYYY-MM-DD`. Built from `formatToParts` with
 * a fixed locale, never by slicing a localized string, so the day is stable
 * across runtimes and daylight saving changes. A bad zone falls back to
 * `Asia/Dhaka`.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone.trim() : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zone,
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}
