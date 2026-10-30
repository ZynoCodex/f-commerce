'use client';

import { Select } from '@/components/ui/primitives';
import { COUNTRY_NAMES } from '@/lib/countries';

const COUNTRY_SET = new Set(COUNTRY_NAMES);

interface CountrySelectProps {
  id?: string;
  value: string;
  onChange: (country: string) => void;
}

/**
 * Country dropdown shared by onboarding and settings. The stored profile keeps
 * full country names, so a value written before this list existed (or edited
 * outside the app) is kept as an option rather than silently replaced.
 */
export function CountrySelect({ id, value, onChange }: CountrySelectProps) {
  const options = value && !COUNTRY_SET.has(value) ? [value, ...COUNTRY_NAMES] : COUNTRY_NAMES;

  return (
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {value === '' && <option value="">Select a country</option>}
      {options.map((country) => (
        <option key={country} value={country}>
          {country}
        </option>
      ))}
    </Select>
  );
}
