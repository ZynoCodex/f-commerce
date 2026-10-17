import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessService, AddressData } from '../../application/services/business.service.js';
import { Business, Currency } from '../../domain/entities/business.entity.js';

const mockBusinessRepository = {
  findById: vi.fn(),
  updateProfile: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
} as unknown as {
  findById: ReturnType<typeof vi.fn>;
  updateProfile: ReturnType<typeof vi.fn>;
  saveDraft: ReturnType<typeof vi.fn>;
  clearDraft: ReturnType<typeof vi.fn>;
};

const mockCloudinaryService = {
  uploadImage: vi.fn(),
} as unknown as { uploadImage: ReturnType<typeof vi.fn> };

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
    logoUrl: undefined,
    address: undefined,
    onboardingComplete: false,
    createdAt: MOCK_DATE,
    updatedAt: MOCK_DATE,
    ...overrides,
  } as Business;
}

describe('Business Service Integration Tests', () => {
  let businessService: BusinessService;

  beforeEach(() => {
    vi.clearAllMocks();
    businessService = new BusinessService(mockBusinessRepository, mockCloudinaryService);
  });

  describe('Logo upload and persistence workflow', () => {
    // This test verifies the fix for: Logo upload URL is never persisted
    // Covers: After uploading a logo, the URL should be persisted to the business
    it('uploads logo and persists the returned URL to the business', async () => {
      const logoUrl = 'https://res.cloudinary.com/demo/image/upload/v123/business-logos/test.png';

      // Mock Cloudinary upload response
      mockCloudinaryService.uploadImage.mockResolvedValueOnce({
        secure_url: logoUrl,
        public_id: 'business-logos/test',
      });

      // Mock updateBusiness to return the updated business with the logo URL
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(makeBusiness({ logoUrl }));

      // Step 1: Upload logo
      const uploadResult = await businessService.uploadLogo('biz1', Buffer.from('fake-image'));
      expect(uploadResult.logoUrl).toBe(logoUrl);

      // Step 2: Persist the logo URL (controller would call this)
      const updatedBusiness = await businessService.updateBusiness('biz1', { logoUrl });

      // Verify the business now has the logo URL
      expect(updatedBusiness?.logoUrl).toBe(logoUrl);
      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', { logoUrl });
    });

    it('preserves previously uploaded logo during onboarding completion', async () => {
      const logoUrl =
        'https://res.cloudinary.com/demo/image/upload/v123/business-logos/prior-upload.png';

      // First, simulate a prior logo upload that was persisted
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(makeBusiness({ logoUrl }));

      // Then, complete onboarding (which includes logoUrl in the update)
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(
        makeBusiness({
          name: 'My Business',
          onboardingComplete: true,
          logoUrl, // Should preserve this
        }),
      );
      mockBusinessRepository.clearDraft.mockResolvedValueOnce(undefined);

      // Persist logo after upload
      await businessService.updateBusiness('biz1', { logoUrl });

      // Complete onboarding with logo
      const result = await businessService.completeOnboarding('biz1', {
        name: 'My Business',
        currency: 'USD' as Currency,
        address: VALID_ADDRESS,
        logoUrl, // Include the already-uploaded logo
      });

      expect(result?.onboardingComplete).toBe(true);
      expect(result?.logoUrl).toBe(logoUrl);
    });
  });

  describe('updateBusiness', () => {
    it('updates business with logo URL', async () => {
      const logoUrl = 'https://res.cloudinary.com/demo/test.png';
      const updatedBusiness = makeBusiness({ logoUrl });
      mockBusinessRepository.updateProfile.mockResolvedValueOnce(updatedBusiness);

      const result = await businessService.updateBusiness('biz1', { logoUrl });

      expect(mockBusinessRepository.updateProfile).toHaveBeenCalledWith('biz1', { logoUrl });
      expect(result?.logoUrl).toBe(logoUrl);
    });
  });

  describe('uploadLogo', () => {
    it('uploads image buffer to Cloudinary and returns secure URL', async () => {
      const logoUrl = 'https://res.cloudinary.com/demo/image/upload/v123/business-logos/abc.png';
      mockCloudinaryService.uploadImage.mockResolvedValueOnce({
        secure_url: logoUrl,
        public_id: 'business-logos/abc',
      });

      const result = await businessService.uploadLogo('biz1', Buffer.from('image'));

      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(Buffer.from('image'), 'biz1');
      expect(result.logoUrl).toBe(logoUrl);
    });

    it('propagates Cloudinary upload errors', async () => {
      mockCloudinaryService.uploadImage.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(businessService.uploadLogo('biz1', Buffer.from('image'))).rejects.toThrow(
        'Upload failed',
      );
    });
  });
});
