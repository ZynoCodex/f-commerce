import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MongooseBusinessRepository } from './business.repository.js';

// Mock the BusinessModel so we never touch a real database
vi.mock('../models/Business.js', () => ({
  BusinessModel: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

import { BusinessModel } from '../models/Business.js';

const VALID_DOC = {
  _id: { toString: () => 'biz1' },
  name: 'Test Co',
  currency: 'BDT',
  logoUrl: 'https://res.cloudinary.com/demo/img.png',
  address: {
    street: '123 Main St',
    city: 'Dhaka',
    region: 'Dhaka Division',
    postalCode: '1000',
    country: 'Bangladesh',
  },
  onboardingComplete: true,
  onboardingDraft: { name: 'Draft Co', currency: 'USD' },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

describe('MongooseBusinessRepository', () => {
  let repository: MongooseBusinessRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new MongooseBusinessRepository();
  });

  describe('findById', () => {
    it('returns a mapped Business when the document exists', async () => {
      vi.mocked(BusinessModel.findById).mockReturnValueOnce({
        lean: () => Promise.resolve(VALID_DOC),
      } as never);

      const result = await repository.findById('biz1');

      expect(result).toEqual({
        id: 'biz1',
        name: 'Test Co',
        currency: 'BDT',
        logoUrl: 'https://res.cloudinary.com/demo/img.png',
        address: {
          street: '123 Main St',
          city: 'Dhaka',
          region: 'Dhaka Division',
          postalCode: '1000',
          country: 'Bangladesh',
        },
        onboardingComplete: true,
        onboardingDraft: { name: 'Draft Co', currency: 'USD' },
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });
    });

    it('returns null when no document is found', async () => {
      vi.mocked(BusinessModel.findById).mockReturnValueOnce({
        lean: () => Promise.resolve(null),
      } as never);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('returns undefined address and onboardingDraft when absent on the document', async () => {
      const leanDoc = { ...VALID_DOC, address: undefined, onboardingDraft: undefined };
      vi.mocked(BusinessModel.findById).mockReturnValueOnce({
        lean: () => Promise.resolve(leanDoc),
      } as never);

      const result = await repository.findById('biz1');

      expect(result).not.toBeNull();
      expect(result!.address).toBeUndefined();
      expect(result!.onboardingDraft).toBeUndefined();
    });
  });

  describe('updateProfile', () => {
    it('builds an update object from only the provided fields and returns the mapped document', async () => {
      const updatedDoc = { ...VALID_DOC, name: 'Updated Name', currency: 'USD' };
      vi.mocked(BusinessModel.findByIdAndUpdate).mockReturnValueOnce({
        lean: () => Promise.resolve(updatedDoc),
      } as never);

      const result = await repository.updateProfile('biz1', {
        name: 'Updated Name',
        currency: 'USD',
      });

      expect(BusinessModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'biz1',
        { name: 'Updated Name', currency: 'USD' },
        { returnDocument: 'after' },
      );
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
      expect(result!.currency).toBe('USD');
    });

    it('returns null when the document is not found', async () => {
      vi.mocked(BusinessModel.findByIdAndUpdate).mockReturnValueOnce({
        lean: () => Promise.resolve(null),
      } as never);

      const result = await repository.updateProfile('nonexistent', { name: 'X' });

      expect(result).toBeNull();
    });

    it('only includes fields that are explicitly set (skips undefined values)', async () => {
      vi.mocked(BusinessModel.findByIdAndUpdate).mockReturnValueOnce({
        lean: () => Promise.resolve(VALID_DOC),
      } as never);

      await repository.updateProfile('biz1', {
        name: 'New',
        currency: undefined,
        logoUrl: undefined,
        address: undefined,
        onboardingComplete: undefined,
        onboardingDraft: undefined,
      });

      const [, updateArg] = vi.mocked(BusinessModel.findByIdAndUpdate).mock.calls[0];
      expect(updateArg).toEqual({ name: 'New' });
    });

    it('persists onboardingComplete and onboardingDraft when provided', async () => {
      vi.mocked(BusinessModel.findByIdAndUpdate).mockReturnValueOnce({
        lean: () => Promise.resolve({ ...VALID_DOC, onboardingComplete: true }),
      } as never);

      await repository.updateProfile('biz1', {
        onboardingComplete: true,
        onboardingDraft: { name: 'Draft', currency: 'EUR' },
      });

      const [, updateArg] = vi.mocked(BusinessModel.findByIdAndUpdate).mock.calls[0];
      expect(updateArg).toEqual({
        onboardingComplete: true,
        onboardingDraft: { name: 'Draft', currency: 'EUR' },
      });
    });
  });

  describe('saveDraft', () => {
    it('sets the nested onboardingDraft field with $set and calls updateOne with _id match', async () => {
      vi.mocked(BusinessModel.updateOne).mockResolvedValueOnce({ modified: 1 } as never);

      await repository.saveDraft('biz1', 'name', 'Draft Co');

      expect(BusinessModel.updateOne).toHaveBeenCalledWith(
        { _id: 'biz1' },
        { $set: { 'onboardingDraft.name': 'Draft Co' } },
      );
    });

    it('sets the onboardingDraft.address sub-document field', async () => {
      const address = { street: '1 St', city: 'City', country: 'BD' };
      vi.mocked(BusinessModel.updateOne).mockResolvedValueOnce({ modified: 1 } as never);

      await repository.saveDraft('biz1', 'address', address);

      expect(BusinessModel.updateOne).toHaveBeenCalledWith(
        { _id: 'biz1' },
        { $set: { 'onboardingDraft.address': address } },
      );
    });
  });

  describe('clearDraft', () => {
    it('unsets the onboardingDraft field', async () => {
      vi.mocked(BusinessModel.updateOne).mockResolvedValueOnce({ modified: 1 } as never);

      await repository.clearDraft('biz1');

      expect(BusinessModel.updateOne).toHaveBeenCalledWith(
        { _id: 'biz1' },
        { $unset: { onboardingDraft: '' } },
      );
    });
  });
});
