import { Business } from '../entities/business.entity.js';

export interface IBusinessRepository {
  findById(id: string): Promise<Business | null>;
  updateProfile(
    id: string,
    data: {
      name?: string;
      currency?: string;
      address?: Business['address'];
      logoUrl?: string;
      onboardingComplete?: boolean;
      onboardingDraft?: Business['onboardingDraft'];
    },
  ): Promise<Business | null>;
  saveDraft(businessId: string, field: string, value: unknown): Promise<void>;
  clearDraft(businessId: string): Promise<void>;
}
