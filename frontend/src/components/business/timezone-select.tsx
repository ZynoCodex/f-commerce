'use client';

import { useMemo } from 'react';
import { Select } from '@/components/ui/primitives';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '@/lib/timezone';

/** Shown when the runtime cannot enumerate zones. */
const FALLBACK_TIME_ZONES = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

/** The runtime list, or the short list when enumeration is unavailable. */
export function supportedTimeZones(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  if (typeof supportedValuesOf !== 'function') return FALLBACK_TIME_ZONES;

  try {
    const zones = supportedValuesOf('timeZone');
    return zones.length > 0 ? zones : FALLBACK_TIME_ZONES;
  } catch {
    return FALLBACK_TIME_ZONES;
  }
}

/** `America/Argentina/Buenos_Aires` becomes `Argentina/Buenos Aires`. */
export function timeZoneLabel(zone: string): string {
  const slash = zone.indexOf('/');
  const remainder = slash === -1 ? zone : zone.slice(slash + 1);
  return remainder.replaceAll('_', ' ');
}

/** The first segment, with `Etc` and a zone without a slash under `Other`. */
export function timeZoneGroup(zone: string): string {
  const slash = zone.indexOf('/');
  if (slash === -1) return 'Other';

  const group = zone.slice(0, slash);
  return group === 'Etc' ? 'Other' : group;
}

export interface TimeZoneGroup {
  name: string;
  zones: string[];
}

/** Group and sort zones alphabetically, keeping the current value present. */
export function groupTimeZones(zones: string[], current: string): TimeZoneGroup[] {
  const unique = new Set(zones);
  const safeCurrent = isValidTimeZone(current) ? current : DEFAULT_TIME_ZONE;
  unique.add(safeCurrent);

  const groups = new Map<string, string[]>();
  for (const zone of unique) {
    const name = timeZoneGroup(zone);
    const group = groups.get(name);
    if (group) group.push(zone);
    else groups.set(name, [zone]);
  }

  return [...groups.entries()]
    .map(([name, groupZones]) => ({
      name,
      zones: groupZones.sort((a, b) => a.localeCompare(b, 'en')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function TimezoneSelect({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => groupTimeZones(supportedTimeZones(), value), [value]);
  const safeValue = isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;

  return (
    <Select
      disabled={disabled}
      id={id}
      value={safeValue}
      onChange={(event) => onChange(event.target.value)}
    >
      {groups.map((group) => (
        <optgroup key={group.name} label={group.name}>
          {group.zones.map((zone) => (
            <option key={zone} value={zone}>
              {timeZoneLabel(zone)}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
