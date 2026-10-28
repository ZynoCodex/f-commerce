import { resolveTimeZone } from '@f-commerce/contracts';

export const DEFAULT_TIME_ZONE = 'Asia/Dhaka';

/**
 * One resolved zone per raw value. Keyed by the current Intl constructor so a
 * replaced constructor (a test or a polyfill) always gets a fresh cache.
 */
const resolvedZoneCaches = new WeakMap<typeof Intl.DateTimeFormat, Map<string, string | null>>();

function resolveCached(value: string): string | null {
  const key = value.trim();
  const Constructor = Intl.DateTimeFormat;
  let cache = resolvedZoneCaches.get(Constructor);
  if (!cache) {
    cache = new Map();
    resolvedZoneCaches.set(Constructor, cache);
  }

  if (cache.has(key)) return cache.get(key) ?? null;

  const resolved = resolveTimeZone(key);
  cache.set(key, resolved);
  return resolved;
}

/** True only for an IANA timezone ID the runtime accepts. */
export function isValidTimeZone(value: string): boolean {
  return resolveCached(value) !== null;
}

/** The canonical zone, or `Asia/Dhaka` when the value is not a valid ID. */
export function normalizeTimeZone(value: string): string {
  return resolveCached(value) ?? DEFAULT_TIME_ZONE;
}

/**
 * One formatter per zone and option set. A formatter is stateless and applies
 * daylight saving at format time, so reuse is safe. Keyed by the current Intl
 * constructor so a replaced constructor is always used.
 */
const formatterCaches = new WeakMap<typeof Intl.DateTimeFormat, Map<string, Intl.DateTimeFormat>>();

export function getDateTimeFormatter(
  key: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const Constructor = Intl.DateTimeFormat;
  let cache = formatterCaches.get(Constructor);
  if (!cache) {
    cache = new Map();
    formatterCaches.set(Constructor, cache);
  }

  const cached = cache.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, options);
  cache.set(key, formatter);
  return formatter;
}

/**
 * The business's calendar day as `YYYY-MM-DD`. Built from `formatToParts`,
 * never by slicing a localized string, so the day is stable across runtimes.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const zone = normalizeTimeZone(timeZone);
  const parts = getDateTimeFormatter(`day|${zone}`, 'en-US', {
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
  const zone = normalizeTimeZone(timeZone);
  const parts = getDateTimeFormatter(`label|${zone}`, 'en-GB', {
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
