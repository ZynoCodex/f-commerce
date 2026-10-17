import { describe, it, expect } from 'vitest';
import { cleanPhone, normalizePhonePrefix } from './customer-phone.js';

describe('cleanPhone', () => {
  // covers AC-2: phone is stored in one canonical form so duplicates are detected
  it('strips spaces, dashes, and brackets from a valid number', () => {
    expect(cleanPhone('+880 1712-345678')).toBe('+8801712345678');
    expect(cleanPhone('+880 (1712) 345-678')).toBe('+8801712345678');
  });

  it('converts Bengali digits to ASCII', () => {
    expect(cleanPhone('+৮৮০১৭১২৩৪৫৬৭৮')).toBe('+8801712345678');
  });

  it('accepts the 8 and 15 digit bounds', () => {
    expect(cleanPhone('+12345678')).toBe('+12345678');
    expect(cleanPhone('+123456789012345')).toBe('+123456789012345');
  });

  it('rejects numbers with fewer than 8 digits', () => {
    expect(cleanPhone('+1234567')).toBeNull();
  });

  it('rejects numbers with more than 15 digits', () => {
    expect(cleanPhone('+1234567890123456')).toBeNull();
  });

  it('rejects numbers without a leading plus sign', () => {
    expect(cleanPhone('8801712345678')).toBeNull();
  });

  it('rejects letters and other characters', () => {
    expect(cleanPhone('+88017abc5678')).toBeNull();
    expect(cleanPhone('+880.1712.345678')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(cleanPhone('')).toBeNull();
    expect(cleanPhone('   ')).toBeNull();
  });
});

describe('normalizePhonePrefix', () => {
  // covers AC-7: search matches a partial phone number as a prefix
  it('returns a plus-prefixed partial number with separators removed', () => {
    expect(cleanPhone('+880 17')).toBeNull();
    expect(normalizePhonePrefix('+880 17')).toBe('+88017');
  });

  it('accepts a partial number without a plus sign', () => {
    expect(normalizePhonePrefix('0171')).toBe('0171');
    expect(normalizePhonePrefix('017-1')).toBe('0171');
  });

  it('converts Bengali digits to ASCII', () => {
    expect(normalizePhonePrefix('০১৭')).toBe('017');
  });

  it('returns null for text so the caller searches by name', () => {
    expect(normalizePhonePrefix('Rahim')).toBeNull();
    expect(normalizePhonePrefix('017 rahim')).toBeNull();
  });

  it('returns null when there are no digits', () => {
    expect(normalizePhonePrefix('')).toBeNull();
    expect(normalizePhonePrefix('+')).toBeNull();
  });
});
