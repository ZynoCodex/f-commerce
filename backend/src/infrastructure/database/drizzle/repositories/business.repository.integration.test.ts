import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleBusinessRepository } from './business.repository.js';
import { getDb } from '../client.js';
import { businesses } from '../schema.js';
import { startPg, stopPg, resetDatabase } from '../../../../test-support/pg-test-database.js';

const BIZ = '00000000-0000-0000-0000-000000000011';
const OTHER = '00000000-0000-0000-0000-000000000012';
const MISSING = '00000000-0000-0000-0000-00000000dead';

const ADDRESS = {
  street: '123 Main St',
  city: 'Dhaka',
  region: 'Dhaka Division',
  postalCode: '1000',
  country: 'Bangladesh',
};

async function seedBusiness(): Promise<void> {
  await getDb()
    .insert(businesses)
    .values({
      id: BIZ,
      name: 'Test Co',
      currency: 'BDT',
      logoUrl: 'https://res.cloudinary.com/demo/img.png',
      address: ADDRESS,
      onboardingComplete: true,
      onboardingDraft: { name: 'Draft Co', currency: 'USD' },
    });
}

describe('DrizzleBusinessRepository', () => {
  beforeAll(async () => {
    await startPg();
  }, 60_000);

  afterAll(async () => {
    await stopPg();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase();
    await seedBusiness();
  });

  const repository = new DrizzleBusinessRepository();

  describe('findById', () => {
    it('returns a mapped Business when the row exists', async () => {
      const result = await repository.findById(BIZ);

      expect(result).toMatchObject({
        id: BIZ,
        name: 'Test Co',
        currency: 'BDT',
        logoUrl: 'https://res.cloudinary.com/demo/img.png',
        address: ADDRESS,
        onboardingComplete: true,
        onboardingDraft: { name: 'Draft Co', currency: 'USD' },
      });
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
    });

    it('returns null when no row is found', async () => {
      expect(await repository.findById(MISSING)).toBeNull();
    });

    it('returns null for a malformed id instead of raising a query error', async () => {
      expect(await repository.findById('not-a-uuid')).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('updates only the provided fields and returns the stored row', async () => {
      const result = await repository.updateProfile(BIZ, {
        name: 'Updated Name',
        currency: 'USD',
      });

      expect(result?.name).toBe('Updated Name');
      expect(result?.currency).toBe('USD');
      // Fields that were not provided keep their stored value.
      expect(result?.logoUrl).toBe('https://res.cloudinary.com/demo/img.png');
      expect(result?.address).toEqual(ADDRESS);
    });

    it('leaves absent fields untouched when the caller passes undefined', async () => {
      const result = await repository.updateProfile(BIZ, {
        name: 'New',
        currency: undefined,
        logoUrl: undefined,
        address: undefined,
        onboardingComplete: undefined,
        onboardingDraft: undefined,
      });

      expect(result?.name).toBe('New');
      expect(result?.currency).toBe('BDT');
      expect(result?.onboardingDraft).toEqual({ name: 'Draft Co', currency: 'USD' });
    });

    it('persists onboardingComplete and onboardingDraft when provided', async () => {
      const result = await repository.updateProfile(BIZ, {
        onboardingComplete: false,
        onboardingDraft: { name: 'Draft', currency: 'EUR' },
      });

      expect(result?.onboardingComplete).toBe(false);
      expect(result?.onboardingDraft).toEqual({ name: 'Draft', currency: 'EUR' });
    });

    it('returns null when the row is not found', async () => {
      expect(await repository.updateProfile(MISSING, { name: 'X' })).toBeNull();
    });
  });

  describe('saveDraft', () => {
    it('merges one draft field without clearing the others', async () => {
      await repository.saveDraft(BIZ, 'name', 'Renamed Draft');

      const result = await repository.findById(BIZ);
      expect(result?.onboardingDraft).toEqual({ name: 'Renamed Draft', currency: 'USD' });
    });

    it('stores an address draft object', async () => {
      await repository.saveDraft(BIZ, 'address', ADDRESS);

      const result = await repository.findById(BIZ);
      expect(result?.onboardingDraft).toMatchObject({ address: ADDRESS });
    });

    it('creates the draft when the row has none', async () => {
      await getDb().update(businesses).set({ onboardingDraft: null });
      await repository.saveDraft(BIZ, 'currency', 'GBP');

      const result = await repository.findById(BIZ);
      expect(result?.onboardingDraft).toEqual({ currency: 'GBP' });
    });
  });

  describe('clearDraft', () => {
    it('unsets the onboarding draft', async () => {
      await repository.clearDraft(BIZ);

      const result = await repository.findById(BIZ);
      expect(result?.onboardingDraft).toBeUndefined();
    });
  });

  describe('tenant isolation', () => {
    it('scopes updates and drafts to the addressed business row', async () => {
      await getDb().insert(businesses).values({ id: OTHER, name: 'Other Co', currency: 'USD' });

      await repository.updateProfile(BIZ, { name: 'Renamed Co', currency: 'EUR' });
      await repository.saveDraft(OTHER, 'name', 'Other Draft');

      const mine = await repository.findById(BIZ);
      const other = await repository.findById(OTHER);

      expect(mine?.name).toBe('Renamed Co');
      expect(mine?.currency).toBe('EUR');
      expect(mine?.onboardingDraft).toEqual({ name: 'Draft Co', currency: 'USD' });
      expect(other?.name).toBe('Other Co');
      expect(other?.onboardingDraft).toEqual({ name: 'Other Draft' });
    });
  });
});
