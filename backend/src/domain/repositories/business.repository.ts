import { Business } from '../entities/business.entity.js';

export interface IBusinessRepository {
  findById(id: string): Promise<Business | null>;
  updateProfile(
    id: string,
    data: {
      name?: string;
      currency?: string;
      timezone?: string;
      address?: Business['address'];
      logoUrl?: string;
      onboardingComplete?: boolean;
      onboardingDraft?: Business['onboardingDraft'];
    },
  ): Promise<Business | null>;
  /**
   * Merge one field into the onboarding draft.
   *
   * Resolves true when the write landed, false when it was skipped because the
   * business had already finished onboarding (or the id was not a UUID).
   */
  saveDraft(businessId: string, field: string, value: unknown): Promise<boolean>;
  clearDraft(businessId: string): Promise<void>;
}
