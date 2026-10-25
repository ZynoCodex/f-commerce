import { TimezoneSchema } from '@f-commerce/contracts';

export const DEFAULT_TIME_ZONE = 'Asia/Dhaka';

/** True only for an IANA timezone ID the runtime accepts. */
export function isValidTimeZone(value: string): boolean {
  return TimezoneSchema.safeParse(value).success;
}

/**
 * The business's calendar day as `YYYY-MM-DD`. Built from `formatToParts`,
 * never by slicing a localized string, so the day is stable across runtimes.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
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

/** The shell header label, for example `Sunday, 25 October`. */
export function formatBusinessDayLabel(timeZone: string, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zone,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';

  return `${weekday}, ${day} ${month}`;
}
