import { resolveTimeZone } from '@f-commerce/contracts';

export const DEFAULT_TIME_ZONE = 'Asia/Dhaka';

/**
 * True only for a bare `UTC` or an `Area/Location` IANA ID. Fixed offsets such
 * as `+06:00` and abbreviations such as `BST` are rejected, because they do not
 * survive daylight saving changes. This is the same rule the contracts schema
 * enforces, so a value accepted here is a value the API accepts too.
 */
export function isValidTimeZone(value: unknown): boolean {
  return typeof value === 'string' && resolveTimeZone(value) !== null;
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
