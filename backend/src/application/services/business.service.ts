import { IBusinessRepository } from '../../domain/repositories/business.repository.js';
import { Business } from '../../domain/entities/business.entity.js';
import { CloudinaryService } from '../../infrastructure/services/cloudinary.service.js';
import { BadRequestError } from '../../domain/errors.js';

export interface AddressData {
  street: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
}

import { Currency } from '../../domain/entities/business.entity.js';

export interface BusinessUpdateData {
  name?: string;
  currency?: Currency;
  logoUrl?: string;
  address?: AddressData;
  onboardingComplete?: boolean;
}

export class BusinessService {
  constructor(
    private readonly businessRepository: IBusinessRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getBusiness(businessId: string): Promise<Business | null> {
    return this.businessRepository.findById(businessId);
  }

  async updateBusiness(businessId: string, data: BusinessUpdateData): Promise<Business | null> {
    return this.businessRepository.updateProfile(businessId, data);
  }

  async saveDraft(businessId: string, field: string, value: unknown): Promise<void> {
    await this.businessRepository.saveDraft(businessId, field, value);
  }

  async completeOnboarding(
    businessId: string,
    data: {
      name: string;
      currency: Currency;
      address: AddressData;
      logoUrl?: string;
    },
  ): Promise<Business | null> {
    if (!data.name || !data.currency || !data.address) {
      throw new BadRequestError('Name, currency, and address are required to complete onboarding');
    }
    const updated = await this.businessRepository.updateProfile(businessId, {
      name: data.name,
      currency: data.currency,
      address: data.address,
      logoUrl: data.logoUrl,
      onboardingComplete: true,
    });
    // Clear the onboarding draft after promoting fields to the live profile
    await this.businessRepository.clearDraft(businessId);
    return updated;
  }

  async uploadLogo(businessId: string, imageBuffer: Buffer): Promise<{ logoUrl: string }> {
    const result = await this.cloudinaryService.uploadImage(imageBuffer, businessId);
    return { logoUrl: result.secure_url };
  }
}
