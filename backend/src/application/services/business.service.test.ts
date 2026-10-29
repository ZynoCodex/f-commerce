import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { BusinessService, AddressData } from './business.service.js';
import { Business, Currency } from '../../domain/entities/business.entity.js';
import { IBusinessRepository } from '../../domain/repositories/business.repository.js';
import { CloudinaryService } from '../../infrastructure/services/cloudinary.service.js';
import { BadRequestError } from '../../domain/errors.js';

const mockBusinessRepository = {
  findById: vi.fn(),
  updateProfile: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
} as unknown as Mocked<IBusinessRepository>;

const mockCloudinaryService = {
  uploadImage: vi.fn(),
} as unknown as Mocked<CloudinaryService>;

const MOCK_DATE = new Date('2026-01-01');

const VALID_ADDRESS: AddressData = {
  street: '123 Main St',
  city: 'Dhaka',
  region: 'Dhaka Division',
  postalCode: '1000',
  country: 'Bangladesh',
};

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz1',
    name: 'Test Co',
    currency: 'BDT',
    timezone: 'Asia/Dhaka',
    logoUrl: undefined,
    address: undefined,
    onboardingComplete: false,
    createdAt: MOCK_DATE,
    updatedAt: MOCK_DATE,
    ...overrides,
  } as Business;
}

describe('BusinessService', () => {
  let businessService: BusinessService;

  beforeEach(() => {
    vi.clearAllMocks();
    businessService = new BusinessService(mockBusinessRepository, mockCloudinaryService);
  });

  describe('getBusiness', () => {
    // covers AC-4: retrieving business profile
    it('returns the business when found', async () => {
      const mockBusiness = makeBusiness({ onboardingComplete: true });
      mockBusinessRepository.findById.mockResolvedValueOnce(mockBusiness);

      const result = await businessService.getBusiness('biz1');

      expect(result).toEqual(mockBusiness);
      expect(mockBusinessRepository.findById).toHaveBeenCalledWith('biz1');
    });

    it('returns null when the business does not exist', async () => {
      mockBusinessRepository.findById.mockResolvedValueOnce(null);

      const result = await businessService.getBusiness('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateBusiness', () => {
    // covers AC-5: owner edits business profile from Settings
    it('passes the update data through to the repository', async () => {
      const updateData = { name: 'Updated Name', currency: 'USD' as Currency };
      const mockUpdated = makeBusiness({ name: 'Updated Name', currency: 'USD' as Currency });
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(mockUpdated);

      const result = await businessService.updateBusiness('biz1', updateData);

      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', updateData);
      expect(result).toEqual(mockUpdated);
    });

    it('returns null when the business is not found', async () => {
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(null);

      const result = await businessService.updateBusiness('nonexistent', { name: 'X' });

      expect(result).toBeNull();
    });

    it('forwards partial updates with only provided fields', async () => {
      const mockUpdated = makeBusiness();
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(mockUpdated);

      await businessService.updateBusiness('biz1', { currency: 'EUR' as Currency });

      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', {
        currency: 'EUR',
      });
    });
  });

  describe('saveDraft', () => {
    // covers AC-1: wizard resume persists progress to onboardingDraft
    it('returns true and delegates to the repository saveDraft method', async () => {
      mockBusinessRepository.saveDraft.mockResolvedValueOnce(true);

      const saved = await businessService.saveDraft('biz1', 'name', 'Draft Co');

      expect(saved).toBe(true);
      expect(mockBusinessRepository.saveDraft).toHaveBeenCalledWith('biz1', 'name', 'Draft Co');
    });

    it('reports false when the repository skipped the write', async () => {
      // A completed business has no draft left to write.
      mockBusinessRepository.saveDraft.mockResolvedValueOnce(false);

      const saved = await businessService.saveDraft('biz1', 'timezone', 'Pacific/Apia');

      expect(saved).toBe(false);
    });

    it('delegates address draft saves to the repository', async () => {
      const addressDraft = { street: '1 St', city: 'City', country: 'BD' };
      mockBusinessRepository.saveDraft.mockResolvedValueOnce(true);

      const saved = await businessService.saveDraft('biz1', 'address', addressDraft);

      expect(saved).toBe(true);
      expect(mockBusinessRepository.saveDraft).toHaveBeenCalledWith(
        'biz1',
        'address',
        addressDraft,
      );
    });
  });

  describe('completeOnboarding', () => {
    // covers AC-4: completing the wizard sets onboardingComplete=true and redirects to dashboard
    // covers key invariant: onboardingComplete is only set when name, currency, and address are all populated
    it('sets onboardingComplete true, saves all fields, and clears the draft', async () => {
      const completeData = {
        name: 'My Business',
        currency: 'BDT' as Currency,
        timezone: 'Asia/Dhaka',
        address: VALID_ADDRESS,
        logoUrl: 'https://res.cloudinary.com/demo/image.png',
      };
      const mockUpdated = makeBusiness({
        name: 'My Business',
        onboardingComplete: true,
      });
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(mockUpdated);
      mockBusinessRepository.clearDraft.mockResolvedValueOnce(undefined);

      const result = await businessService.completeOnboarding('biz1', completeData);

      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', {
        name: 'My Business',
        currency: 'BDT',
        timezone: 'Asia/Dhaka',
        address: VALID_ADDRESS,
        logoUrl: 'https://res.cloudinary.com/demo/image.png',
        onboardingComplete: true,
      });
      expect(mockBusinessRepository.clearDraft).toHaveBeenCalledWith('biz1');
      expect(result).toEqual(mockUpdated);
    });

    it('throws BadRequestError when name is missing', async () => {
      await expect(
        businessService.completeOnboarding('biz1', {
          name: '',
          currency: 'BDT' as Currency,
          timezone: 'Asia/Dhaka',
          address: VALID_ADDRESS,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockBusinessRepository.updateProfile).not.toHaveBeenCalled();
      expect(mockBusinessRepository.clearDraft).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when currency is missing', async () => {
      await expect(
        businessService.completeOnboarding('biz1', {
          name: 'Biz',
          currency: '' as Currency,
          timezone: 'Asia/Dhaka',
          address: VALID_ADDRESS,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockBusinessRepository.updateProfile).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when timezone is missing', async () => {
      await expect(
        businessService.completeOnboarding('biz1', {
          name: 'Biz',
          currency: 'BDT' as Currency,
          timezone: '',
          address: VALID_ADDRESS,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockBusinessRepository.updateProfile).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when address is missing', async () => {
      await expect(
        businessService.completeOnboarding('biz1', {
          name: 'Biz',
          currency: 'BDT' as Currency,
          timezone: 'Asia/Dhaka',
          address: undefined as unknown as AddressData,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockBusinessRepository.updateProfile).not.toHaveBeenCalled();
    });

    it('completes onboarding without a logo URL', async () => {
      const completeData = {
        name: 'My Business',
        currency: 'USD' as Currency,
        timezone: 'Europe/London',
        address: VALID_ADDRESS,
      };
      const mockUpdated = makeBusiness({
        name: 'My Business',
        onboardingComplete: true,
      });
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(mockUpdated);
      mockBusinessRepository.clearDraft.mockResolvedValueOnce(undefined);

      const result = await businessService.completeOnboarding('biz1', completeData);

      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', {
        name: 'My Business',
        currency: 'USD',
        timezone: 'Europe/London',
        address: VALID_ADDRESS,
        logoUrl: undefined,
        onboardingComplete: true,
      });
      expect(mockBusinessRepository.clearDraft).toHaveBeenCalledWith('biz1');
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('uploadLogo', () => {
    // covers AC-3: logo upload endpoint accepts image, proxies to Cloudinary, returns secure URL
    it('uploads the image buffer and returns the secure URL', async () => {
      const buffer = Buffer.from('fake-image-data');
      mockCloudinaryService.uploadImage.mockResolvedValueOnce({
        secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/business-logos/abc.png',
        public_id: 'business-logos/abc',
      });

      const result = await businessService.uploadLogo('biz1', buffer);

      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(buffer, 'biz1');
      expect(result.logoUrl).toBe(
        'https://res.cloudinary.com/demo/image/upload/v123/business-logos/abc.png',
      );
    });

    it('propagates upload errors from Cloudinary', async () => {
      const buffer = Buffer.from('fake-image-data');
      mockCloudinaryService.uploadImage.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(businessService.uploadLogo('biz1', buffer)).rejects.toThrow('Upload failed');
    });

    it('permits updating logo URL independently via updateBusiness', async () => {
      // This test verifies the fix for: Logo upload URL is never persisted
      // After uploadLogo returns a URL, updateBusiness should save it to the business
      const logoUrl =
        'https://res.cloudinary.com/demo/image/upload/v123/business-logos/new-logo.png';
      const updatedBusiness = makeBusiness({ logoUrl });

      mockBusinessRepository.updateProfile.mockResolvedValueOnce(updatedBusiness);

      const result = await businessService.updateBusiness('biz1', { logoUrl });

      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', { logoUrl });
      expect(result?.logoUrl).toBe(logoUrl);
    });
  });
});
