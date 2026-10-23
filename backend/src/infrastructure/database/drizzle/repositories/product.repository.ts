import { and, asc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getDb } from '../client.js';
import { auditLogs, categories, orderItems, productVariants, products } from '../schema.js';
import { getTenantId } from '../context.js';
import { isUuid } from '../../../../domain/uuid.js';
import {
  Product,
  ProductVariant,
  StockStatus,
} from '../../../../domain/entities/product.entity.js';
import {
  IProductRepository,
  ProductAuditEntry,
  ProductDeleteResult,
  ProductImageWriteResult,
  ProductRecord,
  ProductSearchQuery,
  ProductSearchResult,
  ProductUpdateData,
  SkuOwner,
} from '../../../../domain/repositories/product.repository.js';
import { DuplicateSkuError } from '../../../../domain/errors.js';
import { isForeignKeyViolation } from '../../../../application/services/database-errors.js';
import { buildProductSearchCondition } from './product-search.js';

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;
type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** Stable key for a variant combination, independent of key order and case. */
function combinationKey(combination: Record<string, string>): string {
  return Object.keys(combination)
    .sort()
    .map((key) => `${key.toLowerCase()}\u0000${combination[key].toLowerCase()}`)
    .join('\u0001');
}

function skusOf(productSku: string | null | undefined, variants: { sku?: string }[]): string[] {
  return [
    ...(productSku ? [productSku] : []),
    ...variants.flatMap((variant) => (variant.sku ? [variant.sku] : [])),
  ];
}

function toProductVariant(row: VariantRow): ProductVariant {
  return {
    id: row.id,
    combination: row.combination,
    sku: row.sku ?? undefined,
    price: row.price ?? undefined,
    cost: row.cost ?? undefined,
    stockCount: row.stockCount,
    imageUrl: row.imageUrl ?? undefined,
  };
}

function toProduct(row: ProductRow, variants: VariantRow[]): Product {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description ?? undefined,
    categoryId: row.categoryId,
    sku: row.sku ?? undefined,
    price: row.price,
    cost: row.cost ?? undefined,
    stockCount: row.stockCount,
    lowStockThreshold: row.lowStockThreshold,
    images: row.images,
    options: row.options,
    variants: variants.map(toProductVariant),
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ?? undefined,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** A correlated EXISTS against the variants of the current product row. */
function variantExists(businessId: string, extra?: SQL): SQL {
  return sql`exists (select 1 from ${productVariants} where ${productVariants.businessId} = ${businessId} and ${productVariants.productId} = ${products.id}${extra ? sql` and ${extra}` : sql``})`;
}

/**
 * SQL condition for the derived stock status per AC-6. Evaluated before paging
 * so a filtered page cannot be short or wrong.
 */
function stockStatusCondition(status: StockStatus, businessId: string): SQL {
  const hasVariants = variantExists(businessId);
  const noVariants = sql`not (${hasVariants})`;
  const hasInStock = variantExists(
    businessId,
    sql`${productVariants.stockCount} > ${products.lowStockThreshold}`,
  );
  const hasLowStock = variantExists(
    businessId,
    sql`${productVariants.stockCount} > 0 and ${productVariants.stockCount} <= ${products.lowStockThreshold}`,
  );
  const allVariantsOut = sql`not (${variantExists(businessId, sql`${productVariants.stockCount} > 0`)})`;

  switch (status) {
    case StockStatus.OUT_OF_STOCK:
      return sql`((${noVariants}) and ${products.stockCount} = 0) or ((${hasVariants}) and ${allVariantsOut})`;
    case StockStatus.LOW_STOCK:
      return sql`((${noVariants}) and ${products.stockCount} > 0 and ${products.stockCount} <= ${products.lowStockThreshold}) or ((${hasVariants}) and ${hasLowStock} and not (${hasInStock}))`;
    case StockStatus.IN_STOCK:
      return sql`((${noVariants}) and ${products.stockCount} > ${products.lowStockThreshold}) or ((${hasVariants}) and ${hasInStock})`;
  }
}

export class DrizzleProductRepository implements IProductRepository {
  async findById(id: string): Promise<ProductRecord | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    const rows = await getDb()
      .select({ product: products, categoryName: categories.name })
      .from(products)
      .leftJoin(
        categories,
        and(eq(categories.id, products.categoryId), eq(categories.businessId, products.businessId)),
      )
      .where(and(eq(products.id, id), eq(products.businessId, businessId)));
    if (rows.length === 0) return null;

    const variantRows = await getDb()
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, id), eq(productVariants.businessId, businessId)))
      .orderBy(asc(productVariants.position));

    return {
      product: toProduct(rows[0].product, variantRows),
      categoryName: rows[0].categoryName ?? null,
    };
  }

  async insert(data: Product): Promise<Product> {
    const businessId = getTenantId() ?? data.businessId;
    const now = new Date();

    return await getDb().transaction(async (tx) => {
      await this.lockAndCheckSkus(tx, businessId, skusOf(data.sku, data.variants));

      const inserted = await tx
        .insert(products)
        .values({
          businessId,
          categoryId: data.categoryId,
          name: data.name,
          description: data.description ?? null,
          sku: data.sku ?? null,
          price: data.price,
          cost: data.cost ?? null,
          stockCount: data.stockCount,
          lowStockThreshold: data.lowStockThreshold,
          images: data.images,
          options: data.options,
          isArchived: data.isArchived,
          archivedAt: data.archivedAt ?? null,
          version: data.version,
          createdAt: data.createdAt ?? now,
          updatedAt: data.updatedAt ?? now,
        })
        .returning();

      if (inserted.length === 0) {
        throw new Error('Failed to insert product');
      }
      const product = inserted[0];

      if (data.variants.length > 0) {
        await tx.insert(productVariants).values(
          data.variants.map((variant, position) => ({
            businessId,
            productId: product.id,
            combination: variant.combination,
            sku: variant.sku ?? null,
            price: variant.price ?? null,
            cost: variant.cost ?? null,
            stockCount: variant.stockCount,
            imageUrl: variant.imageUrl ?? null,
            position,
          })),
        );
      }

      const variantRows = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id))
        .orderBy(asc(productVariants.position));

      return toProduct(product, variantRows);
    });
  }

  async update(
    id: string,
    expectedVersion: number,
    changes: ProductUpdateData,
    nextVersion: number,
    lockSkus: string[],
  ): Promise<Product | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    return await getDb().transaction(async (tx) => {
      await this.lockAndCheckSkus(tx, businessId, lockSkus, id);

      const setParams: Record<string, unknown> = {
        version: nextVersion,
        updatedAt: new Date(),
      };
      for (const [field, value] of Object.entries(changes)) {
        if (field === 'variants') continue;
        if (value === null) {
          setParams[field] = null;
        } else if (value !== undefined) {
          setParams[field] = value;
        }
      }

      const updated = await tx
        .update(products)
        .set(setParams)
        .where(
          and(
            eq(products.id, id),
            eq(products.businessId, businessId),
            eq(products.version, expectedVersion),
          ),
        )
        .returning();

      if (updated.length === 0) return null;
      const product = updated[0];

      if (changes.variants !== undefined) {
        const now = new Date();
        const existing = await tx
          .select()
          .from(productVariants)
          .where(and(eq(productVariants.productId, id), eq(productVariants.businessId, businessId)))
          .orderBy(asc(productVariants.position));

        const incoming = changes.variants;
        const incomingKeys = new Set(
          incoming.map((variant) => combinationKey(variant.combination)),
        );
        const retained = existing.filter((variant) =>
          incomingKeys.has(combinationKey(variant.combination)),
        );
        const removedIds = existing
          .filter((variant) => !incomingKeys.has(combinationKey(variant.combination)))
          .map((variant) => variant.id);

        if (removedIds.length > 0) {
          await tx
            .delete(productVariants)
            .where(
              and(
                eq(productVariants.productId, id),
                eq(productVariants.businessId, businessId),
                inArray(productVariants.id, removedIds),
              ),
            );
        }

        // Move retained rows out of the final position range before assigning
        // the new order, so a swap cannot trip the (product, position) index.
        if (retained.length > 0) {
          await tx
            .update(productVariants)
            .set({
              // Clear variant SKUs for the same reason: two variants may swap
              // their SKUs, and the unique index would reject the first write.
              // updatedAt is restored by the bulk write below, so only rows
              // whose final values change are marked as updated.
              sku: null,
              position: sql`${productVariants.position} + 1000`,
            })
            .where(
              and(
                eq(productVariants.productId, id),
                eq(productVariants.businessId, businessId),
                inArray(
                  productVariants.id,
                  retained.map((variant) => variant.id),
                ),
              ),
            );
        }

        const retainedByKey = new Map(
          retained.map((variant) => [combinationKey(variant.combination), variant]),
        );

        const retainedUpdates: {
          id: string;
          variant: ProductVariant;
          imageUrl: string | null;
          position: number;
          changed: boolean;
        }[] = [];
        const newRows: (typeof productVariants.$inferInsert)[] = [];

        for (const [position, variant] of incoming.entries()) {
          const match = retainedByKey.get(combinationKey(variant.combination));
          if (match) {
            // Omitted means unchanged; an explicit null clears the image.
            const imageUrl =
              variant.imageUrl !== undefined ? variant.imageUrl : (match.imageUrl ?? null);
            const changed =
              combinationKey(match.combination) !== combinationKey(variant.combination) ||
              (match.sku ?? null) !== (variant.sku ?? null) ||
              (match.price ?? null) !== (variant.price ?? null) ||
              (match.cost ?? null) !== (variant.cost ?? null) ||
              match.stockCount !== variant.stockCount ||
              (match.imageUrl ?? null) !== imageUrl ||
              match.position !== position;
            retainedUpdates.push({ id: match.id, variant, imageUrl, position, changed });
          } else {
            newRows.push({
              businessId,
              productId: id,
              combination: variant.combination,
              sku: variant.sku ?? null,
              price: variant.price ?? null,
              cost: variant.cost ?? null,
              stockCount: variant.stockCount,
              imageUrl: variant.imageUrl ?? null,
              position,
            });
          }
        }

        // One statement for all retained rows; only rows whose final values
        // differ get a new updatedAt.
        if (retainedUpdates.length > 0) {
          const rows = retainedUpdates.map(
            (entry) => sql`(
              ${entry.id}::uuid,
              ${JSON.stringify(entry.variant.combination)}::jsonb,
              ${entry.variant.sku ?? null}::text,
              ${entry.variant.price ?? null}::integer,
              ${entry.variant.cost ?? null}::integer,
              ${entry.variant.stockCount}::integer,
              ${entry.imageUrl}::text,
              ${entry.position}::integer,
              ${entry.changed}::boolean
            )`,
          );
          await tx.execute(sql`
            update ${productVariants} as v
            set
              combination = data.combination,
              sku = data.sku,
              price = data.price,
              cost = data.cost,
              stock_count = data.stock_count,
              image_url = data.image_url,
              position = data.position,
              updated_at = case when data.changed then ${now} else v.updated_at end
            from (values ${sql.join(rows, sql`, `)})
              as data(id, combination, sku, price, cost, stock_count, image_url, position, changed)
            where v.id = data.id
              and v.product_id = ${id}
              and v.business_id = ${businessId}
          `);
        }

        if (newRows.length > 0) {
          await tx.insert(productVariants).values(newRows);
        }
      }

      const variantRows = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, id))
        .orderBy(asc(productVariants.position));

      return toProduct(product, variantRows);
    });
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const businessId = getTenantId();
    if (!businessId) {
      return { items: [], hasMore: false };
    }

    const conditions: SQL[] = [eq(products.businessId, businessId)];
    if (!query.includeArchived) {
      conditions.push(eq(products.isArchived, false));
    }

    if (query.q !== '') {
      const searchCondition = buildProductSearchCondition(query.q);
      if (searchCondition) conditions.push(searchCondition);
    }

    if (query.categoryId !== null) {
      conditions.push(eq(products.categoryId, query.categoryId));
    }

    if (query.stockStatus !== null) {
      conditions.push(stockStatusCondition(query.stockStatus, businessId));
    }

    if (query.name !== undefined && query.id !== undefined && isUuid(query.id)) {
      const cursorCondition = or(
        sql`lower(${products.name}) > lower(${query.name})`,
        and(sql`lower(${products.name}) = lower(${query.name})`, gt(products.id, query.id)),
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }

    const rows = await getDb()
      .select({ product: products, categoryName: categories.name })
      .from(products)
      .leftJoin(
        categories,
        and(eq(categories.id, products.categoryId), eq(categories.businessId, products.businessId)),
      )
      .where(and(...conditions))
      .orderBy(sql`lower(${products.name}) asc`, asc(products.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const ids = page.map((row) => row.product.id);
    const variantRows =
      ids.length === 0
        ? []
        : await getDb()
            .select()
            .from(productVariants)
            .where(
              and(
                eq(productVariants.businessId, businessId),
                inArray(productVariants.productId, ids),
              ),
            )
            .orderBy(asc(productVariants.productId), asc(productVariants.position));

    const variantsByProduct = new Map<string, VariantRow[]>();
    for (const variant of variantRows) {
      const list = variantsByProduct.get(variant.productId);
      if (list) list.push(variant);
      else variantsByProduct.set(variant.productId, [variant]);
    }

    return {
      items: page.map((row) => ({
        product: toProduct(row.product, variantsByProduct.get(row.product.id) ?? []),
        categoryName: row.categoryName ?? null,
      })),
      hasMore,
    };
  }

  async findSkuOwners(skus: string[], excludeProductId?: string): Promise<Map<string, SkuOwner>> {
    return await getDb().transaction(async (tx) =>
      this.findSkuOwnersWith(tx, getTenantId(), skus, excludeProductId),
    );
  }

  async checkSkuAvailability(
    skus: string[],
    excludeProductId?: string,
  ): Promise<Map<string, SkuOwner>> {
    const businessId = getTenantId();
    if (!businessId) return new Map();
    return await getDb().transaction(async (tx) => {
      await this.lockSkus(tx, businessId, skus);
      return await this.findSkuOwnersWith(tx, businessId, skus, excludeProductId);
    });
  }

  /** Batch lookup shared by the pre-check and the locked backstop. */
  private async findSkuOwnersWith(
    tx: DbTransaction,
    businessId: string | null | undefined,
    skus: string[],
    excludeProductId?: string,
  ): Promise<Map<string, SkuOwner>> {
    const owners = new Map<string, SkuOwner>();
    if (!businessId || skus.length === 0) return owners;

    const unique = Array.from(new Set(skus));
    const productConditions = [eq(products.businessId, businessId), inArray(products.sku, unique)];
    if (excludeProductId && isUuid(excludeProductId)) {
      productConditions.push(ne(products.id, excludeProductId));
    }

    const productRows = await tx
      .select({ id: products.id, sku: products.sku, archived: products.isArchived })
      .from(products)
      .where(and(...productConditions));

    for (const row of productRows) {
      if (row.sku) {
        owners.set(row.sku, {
          productId: row.id,
          variantId: null,
          archived: row.archived,
        });
      }
    }

    const variantConditions = [
      eq(productVariants.businessId, businessId),
      inArray(productVariants.sku, unique),
    ];
    if (excludeProductId && isUuid(excludeProductId)) {
      variantConditions.push(ne(productVariants.productId, excludeProductId));
    }

    const variantRows = await tx
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        sku: productVariants.sku,
        archived: products.isArchived,
      })
      .from(productVariants)
      .innerJoin(
        products,
        and(
          eq(products.id, productVariants.productId),
          eq(products.businessId, productVariants.businessId),
        ),
      )
      .where(and(...variantConditions));

    for (const row of variantRows) {
      if (row.sku && !owners.has(row.sku)) {
        owners.set(row.sku, {
          productId: row.productId,
          variantId: row.variantId,
          archived: row.archived,
        });
      }
    }

    return owners;
  }

  /**
   * Serialize SKU writers per business with transaction scoped advisory
   * locks. A 64-bit hash of (business, sku) avoids the collision risk of the
   * 32-bit hashtext pair, and sorted acquisition keeps writers deadlock free.
   */
  private async lockSkus(tx: DbTransaction, businessId: string, skus: string[]): Promise<void> {
    const unique = Array.from(new Set(skus)).sort();
    for (const sku of unique) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${businessId}:${sku}`}, 0))`,
      );
    }
  }

  /**
   * Lock the full set of current and target SKUs, then re-check both tables.
   * Taking the current SKUs too means a writer releasing a SKU and a writer
   * taking it serialize instead of producing a false DUPLICATE_SKU.
   */
  private async lockAndCheckSkus(
    tx: DbTransaction,
    businessId: string,
    skus: string[],
    excludeProductId?: string,
  ): Promise<void> {
    await this.lockSkus(tx, businessId, skus);

    const owners = await this.findSkuOwnersWith(tx, businessId, skus, excludeProductId);
    for (const owner of owners.values()) {
      throw new DuplicateSkuError(owner.productId, owner.variantId, owner.archived);
    }
  }

  async countOrderItems(productId: string): Promise<number> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(productId)) return 0;

    const counted = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(orderItems)
      .where(and(eq(orderItems.businessId, businessId), eq(orderItems.productId, productId)));
    return Number(counted[0]?.count ?? 0);
  }

  async appendImages(
    id: string,
    urls: string[],
    maxImages: number,
    expectedVersion?: number,
  ): Promise<ProductImageWriteResult> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return { status: 'notFound' };

    return await getDb().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.businessId, businessId)))
        .for('update');
      if (rows.length === 0) return { status: 'notFound' };
      if (rows[0].isArchived) return { status: 'archived' };
      if (expectedVersion !== undefined && rows[0].version !== expectedVersion) {
        return { status: 'changed' };
      }
      if (rows[0].images.length + urls.length > maxImages) {
        return { status: 'limit' };
      }

      const updated = await tx
        .update(products)
        .set({
          images: [...rows[0].images, ...urls],
          version: sql`${products.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, id), eq(products.businessId, businessId)))
        .returning();

      return {
        status: 'ok',
        product: await this.withVariants(tx, updated[0], businessId),
      };
    });
  }

  async removeImageAt(
    id: string,
    index: number,
    expectedVersion?: number,
  ): Promise<ProductImageWriteResult> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return { status: 'notFound' };

    return await getDb().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.businessId, businessId)))
        .for('update');
      if (rows.length === 0) return { status: 'notFound' };
      if (rows[0].isArchived) return { status: 'archived' };
      if (expectedVersion !== undefined && rows[0].version !== expectedVersion) {
        return { status: 'changed' };
      }
      if (!Number.isInteger(index) || index < 0 || index >= rows[0].images.length) {
        return { status: 'range' };
      }

      const images = [...rows[0].images];
      images.splice(index, 1);
      const updated = await tx
        .update(products)
        .set({
          images,
          version: sql`${products.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, id), eq(products.businessId, businessId)))
        .returning();

      return {
        status: 'ok',
        product: await this.withVariants(tx, updated[0], businessId),
      };
    });
  }

  async setVariantImage(
    id: string,
    position: number,
    imageUrl: string,
    expectedVersion?: number,
  ): Promise<ProductImageWriteResult> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return { status: 'notFound' };

    return await getDb().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.businessId, businessId)))
        .for('update');
      if (rows.length === 0) return { status: 'notFound' };
      if (rows[0].isArchived) return { status: 'archived' };
      if (expectedVersion !== undefined && rows[0].version !== expectedVersion) {
        return { status: 'changed' };
      }

      const current = await tx
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, id),
            eq(productVariants.businessId, businessId),
            eq(productVariants.position, position),
          ),
        )
        .limit(1);
      if (current.length === 0) return { status: 'range' };

      if (current[0].imageUrl === imageUrl) {
        return {
          status: 'ok',
          product: await this.withVariants(tx, rows[0], businessId),
        };
      }

      const now = new Date();
      await tx
        .update(productVariants)
        .set({ imageUrl, updatedAt: now })
        .where(
          and(
            eq(productVariants.id, current[0].id),
            eq(productVariants.productId, id),
            eq(productVariants.businessId, businessId),
          ),
        );

      const updated = await tx
        .update(products)
        .set({ version: sql`${products.version} + 1`, updatedAt: now })
        .where(and(eq(products.id, id), eq(products.businessId, businessId)))
        .returning();

      return {
        status: 'ok',
        product: await this.withVariants(tx, updated[0], businessId),
      };
    });
  }

  private async withVariants(
    tx: DbTransaction,
    product: ProductRow,
    businessId: string,
  ): Promise<Product> {
    const variantRows = await tx
      .select()
      .from(productVariants)
      .where(
        and(eq(productVariants.productId, product.id), eq(productVariants.businessId, businessId)),
      )
      .orderBy(asc(productVariants.position));
    return toProduct(product, variantRows);
  }

  async archiveWithAudit(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
  ): Promise<Product | null> {
    return this.applyTransition(id, expectedVersion, audit, (now) => ({
      isArchived: true,
      archivedAt: now,
      version: expectedVersion + 1,
      updatedAt: now,
    }));
  }

  async restoreWithAudit(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
  ): Promise<Product | null> {
    return this.applyTransition(id, expectedVersion, audit, (now) => ({
      isArchived: false,
      archivedAt: null,
      version: expectedVersion + 1,
      updatedAt: now,
    }));
  }

  async deleteWithAudit(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
  ): Promise<ProductDeleteResult> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return 'stale';

    try {
      return await getDb().transaction(async (tx) => {
        const counted = await tx
          .select({ count: sql<number>`count(*)` })
          .from(orderItems)
          .where(and(eq(orderItems.businessId, businessId), eq(orderItems.productId, id)));
        if (Number(counted[0]?.count ?? 0) > 0) return 'inUse';

        const deleted = await tx
          .delete(products)
          .where(
            and(
              eq(products.id, id),
              eq(products.businessId, businessId),
              eq(products.version, expectedVersion),
            ),
          )
          .returning({ id: products.id });
        if (deleted.length === 0) return 'stale';

        await tx.insert(auditLogs).values({
          businessId: audit.businessId,
          userId: audit.userId,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId,
        });
        return 'deleted';
      });
    } catch (error) {
      // A concurrent order item (or inventory row) can win the FK check after
      // the guard count. Treat it as in use instead of a 500.
      if (isForeignKeyViolation(error)) return 'inUse';
      throw error;
    }
  }

  /**
   * Apply an archive or restore and write its audit entry in one transaction,
   * so a failure in either write leaves neither committed.
   */
  private async applyTransition(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
    buildChanges: (now: Date) => Partial<typeof products.$inferInsert>,
  ): Promise<Product | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    return await getDb().transaction(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(products)
        .set(buildChanges(now))
        .where(
          and(
            eq(products.id, id),
            eq(products.businessId, businessId),
            eq(products.version, expectedVersion),
          ),
        )
        .returning();
      if (updated.length === 0) return null;

      await tx.insert(auditLogs).values({
        businessId: audit.businessId,
        userId: audit.userId,
        action: audit.action,
        entityType: audit.entityType,
        entityId: audit.entityId,
      });

      const variantRows = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, id), eq(productVariants.businessId, businessId)))
        .orderBy(asc(productVariants.position));

      return toProduct(updated[0], variantRows);
    });
  }
}
