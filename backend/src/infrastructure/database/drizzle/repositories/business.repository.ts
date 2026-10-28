import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { businesses } from '../schema.js';
import { isUuid } from '../../../../domain/uuid.js';
import { Business } from '../../../../domain/entities/business.entity.js';
import { IBusinessRepository } from '../../../../domain/repositories/business.repository.js';

function toBusiness(row: typeof businesses.$inferSelect): Business {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency as Business['currency'],
    timezone: row.timezone,
    logoUrl: row.logoUrl ?? undefined,
    address: row.address ?? undefined,
    onboardingComplete: row.onboardingComplete,
    onboardingDraft: row.onboardingDraft ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleBusinessRepository implements IBusinessRepository {
  async findById(id: string): Promise<Business | null> {
    if (!isUuid(id)) return null;

    const result = await getDb().select().from(businesses).where(eq(businesses.id, id));
    return result.length > 0 ? toBusiness(result[0]) : null;
  }

  async updateProfile(
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
  ): Promise<Business | null> {
    if (!isUuid(id)) return null;

    const changes: Partial<typeof businesses.$inferInsert> = { updatedAt: new Date() };
    if (data.name !== undefined) changes.name = data.name;
    if (data.currency !== undefined) changes.currency = data.currency;
    if (data.timezone !== undefined) changes.timezone = data.timezone;
    if (data.logoUrl !== undefined) changes.logoUrl = data.logoUrl;
    if (data.address !== undefined) changes.address = data.address;
    if (data.onboardingComplete !== undefined) changes.onboardingComplete = data.onboardingComplete;
    if (data.onboardingDraft !== undefined) changes.onboardingDraft = data.onboardingDraft;

    const result = await getDb()
      .update(businesses)
      .set(changes)
      .where(eq(businesses.id, id))
      .returning();
    return result.length > 0 ? toBusiness(result[0]) : null;
  }

  /**
   * Merge one draft field, preserving every other field already saved.
   * A completed business has no draft, so the write is skipped once onboarding
   * finishes. That closes the race where a draft request is already in flight
   * when onboarding completes: if it lands after `clearDraft`, the completed
   * row is left untouched instead of gaining a stale draft.
   */
  async saveDraft(businessId: string, field: string, value: unknown): Promise<void> {
    if (!isUuid(businessId)) return;

    const patch = JSON.stringify({ [field]: value });
    await getDb()
      .update(businesses)
      .set({
        onboardingDraft: sql`coalesce(${businesses.onboardingDraft}, '{}'::jsonb) || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(businesses.id, businessId), eq(businesses.onboardingComplete, false)));
  }

  async clearDraft(businessId: string): Promise<void> {
    if (!isUuid(businessId)) return;

    await getDb()
      .update(businesses)
      .set({ onboardingDraft: null, updatedAt: new Date() })
      .where(eq(businesses.id, businessId));
  }
}
