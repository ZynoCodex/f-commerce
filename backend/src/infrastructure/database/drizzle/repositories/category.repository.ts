import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { categories, products } from '../schema.js';
import { getTenantId } from '../context.js';
import { isUuid } from '../../../../domain/uuid.js';
import { Category } from '../../../../domain/entities/product.entity.js';
import {
  CategoryDeleteResult,
  CategoryUpdateData,
  ICategoryRepository,
} from '../../../../domain/repositories/category.repository.js';

type CategoryRow = typeof categories.$inferSelect;

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description ?? undefined,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleCategoryRepository implements ICategoryRepository {
  async findById(id: string): Promise<Category | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    const result = await getDb()
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.businessId, businessId)));
    if (result.length === 0) return null;
    return toCategory(result[0]);
  }

  async findByName(name: string, excludeId?: string): Promise<Category | null> {
    const businessId = getTenantId();
    if (!businessId) return null;

    const conditions = [
      eq(categories.businessId, businessId),
      sql`lower(${categories.name}) = lower(${name})`,
    ];
    if (excludeId && isUuid(excludeId)) {
      conditions.push(ne(categories.id, excludeId));
    }

    const result = await getDb()
      .select()
      .from(categories)
      .where(and(...conditions));
    if (result.length === 0) return null;
    return toCategory(result[0]);
  }

  async list(): Promise<Category[]> {
    const businessId = getTenantId();
    if (!businessId) return [];

    const result = await getDb()
      .select()
      .from(categories)
      .where(eq(categories.businessId, businessId))
      .orderBy(sql`lower(${categories.name}) asc`, asc(categories.id));
    return result.map(toCategory);
  }

  async insert(data: Category): Promise<Category> {
    const businessId = getTenantId() ?? data.businessId;
    const now = new Date();

    const result = await getDb()
      .insert(categories)
      .values({
        businessId,
        name: data.name,
        description: data.description ?? null,
        version: data.version,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      })
      .returning();

    if (result.length === 0) {
      throw new Error('Failed to insert category');
    }
    return toCategory(result[0]);
  }

  async update(
    id: string,
    expectedVersion: number,
    changes: CategoryUpdateData,
    nextVersion: number,
  ): Promise<Category | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    const setParams: Record<string, unknown> = { version: nextVersion, updatedAt: new Date() };
    for (const [field, value] of Object.entries(changes)) {
      if (value === null) {
        setParams[field] = null;
      } else if (value !== undefined) {
        setParams[field] = value;
      }
    }

    const result = await getDb()
      .update(categories)
      .set(setParams)
      .where(
        and(
          eq(categories.id, id),
          eq(categories.businessId, businessId),
          eq(categories.version, expectedVersion),
        ),
      )
      .returning();

    if (result.length === 0) return null;
    return toCategory(result[0]);
  }

  /**
   * Lock the category row, count referencing products (archived included), then
   * delete. Locking makes a concurrent product insert block until the delete
   * commits, so the guard cannot be bypassed by a race.
   */
  async deleteWithGuard(id: string): Promise<CategoryDeleteResult> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return { status: 'notFound' };

    return await getDb().transaction(async (tx) => {
      const locked = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.businessId, businessId)))
        .for('update');
      if (locked.length === 0) return { status: 'notFound' };

      const counted = await tx
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.categoryId, id)));
      const productCount = Number(counted[0]?.count ?? 0);
      if (productCount > 0) {
        return { status: 'inUse', productCount };
      }

      await tx
        .delete(categories)
        .where(and(eq(categories.id, id), eq(categories.businessId, businessId)));
      return { status: 'deleted' };
    });
  }
}
