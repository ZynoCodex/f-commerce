import { BaseEntity } from './base.entity.js';

export interface Address {
  street: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
}

export type Currency = 'BDT' | 'USD' | 'EUR' | 'GBP';

export interface Business extends BaseEntity {
  name: string;
  currency: Currency;
  timezone: string;
  /**
   * Absent when the business has no logo. Onboarding sends an empty string to
   * mean "no logo", so a value read back as `''` is normalized to `undefined`
   * and never reaches the profile response.
   */
  logoUrl?: string;
  address?: Address;
  onboardingComplete: boolean;
  onboardingDraft?: {
    name?: string;
    currency?: Currency;
    timezone?: string;
    address?: Address;
    logoUrl?: string;
  };
}
