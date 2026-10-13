import { BusinessModel } from '../models/Business.js';
import { Business } from '../../../../domain/entities/business.entity.js';
import { IBusinessRepository } from '../../../../domain/repositories/business.repository.js';

export class MongooseBusinessRepository implements IBusinessRepository {
  async findById(id: string): Promise<Business | null> {
    const doc = await BusinessModel.findById(id).lean();
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      name: doc.name,
      currency: doc.currency as Business['currency'],
      logoUrl: doc.logoUrl,
      address: doc.address
        ? {
            street: doc.address.street,
            city: doc.address.city,
            region: doc.address.region,
            postalCode: doc.address.postalCode,
            country: doc.address.country,
          }
        : undefined,
      onboardingComplete: doc.onboardingComplete,
      onboardingDraft: doc.onboardingDraft as Business['onboardingDraft'],
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    };
  }

  async updateProfile(
    id: string,
    data: {
      name?: string;
      currency?: string;
      address?: Business['address'];
      logoUrl?: string;
      onboardingComplete?: boolean;
      onboardingDraft?: Business['onboardingDraft'];
    },
  ): Promise<Business | null> {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.currency !== undefined) update.currency = data.currency;
    if (data.logoUrl !== undefined) update.logoUrl = data.logoUrl;
    if (data.address !== undefined) update.address = data.address;
    if (data.onboardingComplete !== undefined) update.onboardingComplete = data.onboardingComplete;
    if (data.onboardingDraft !== undefined) update.onboardingDraft = data.onboardingDraft;

    const doc = await BusinessModel.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      name: doc.name,
      currency: doc.currency as Business['currency'],
      logoUrl: doc.logoUrl,
      address: doc.address
        ? {
            street: doc.address.street,
            city: doc.address.city,
            region: doc.address.region,
            postalCode: doc.address.postalCode,
            country: doc.address.country,
          }
        : undefined,
      onboardingComplete: doc.onboardingComplete,
      onboardingDraft: doc.onboardingDraft as Business['onboardingDraft'],
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    };
  }

  async saveDraft(businessId: string, field: string, value: unknown): Promise<void> {
    const update: Record<string, unknown> = {};
    update[`onboardingDraft.${field}`] = value;
    await BusinessModel.updateOne({ _id: businessId }, { $set: update });
  }

  async clearDraft(businessId: string): Promise<void> {
    await BusinessModel.updateOne({ _id: businessId }, { $unset: { onboardingDraft: '' } });
  }
}
