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
  logoUrl?: string;
  address?: Address;
  onboardingComplete: boolean;
  onboardingDraft?: {
    name?: string;
    currency?: Currency;
    address?: Address;
    logoUrl?: string;
  };
}
