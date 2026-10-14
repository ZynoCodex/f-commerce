const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * Rewrite Bengali digits (০-৯) as ASCII digits so a number typed on a Bengali
 * keyboard stores and matches the same way as one typed in ASCII.
 */
function normalizeDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)));
}

/** Strip the grouping characters sellers use when typing a phone number. */
function stripSeparators(value: string): string {
  return value.replace(/[\s\-()]/g, '');
}

/**
 * Clean a phone number into its stored form: a leading plus sign followed by
 * 8 to 15 digits. Returns null when the value is not a valid phone number.
 */
export function cleanPhone(raw: string): string | null {
  const cleaned = normalizeDigits(stripSeparators(raw));

  if (!/^\+[0-9]{8,15}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Normalize a search query into a phone prefix for matching stored phones.
 * Unlike {@link cleanPhone} a partial number is allowed, because the seller is
 * still typing. Returns null when the query cannot be a phone prefix, which
 * tells the caller to search by name instead.
 */
export function normalizePhonePrefix(raw: string): string | null {
  const cleaned = normalizeDigits(stripSeparators(raw));

  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}