import {
  ProductCreateRequest,
  ProductDto,
  ProductListQuery,
  ProductPageDto,
  ProductUpdateRequest,
} from '@f-commerce/contracts';
import {
  Product,
  ProductOption,
  ProductVariant,
  StockStatus,
} from '../../domain/entities/product.entity.js';
import { ICategoryRepository } from '../../domain/repositories/category.repository.js';
import {
  IProductRepository,
  ProductImageWriteResult,
  ProductRecord,
  ProductUpdateData,
} from '../../domain/repositories/product.repository.js';
import type { ProductImageStorage, UploadedProductImage } from '../ports/product-image-storage.js';
import { validateVariantMatrix } from '../../domain/variant-matrix.js';
import {
  deriveProductStockStatus,
  deriveVariantStatuses,
  sumVariantStock,
} from '../../domain/stock-status.js';
import {
  decodeProductCursor,
  effectivePageSize,
  encodeProductCursor,
} from '../../domain/product-cursor.js';
import {
  DuplicateSkuError,
  ProductArchivedError,
  ProductChangedError,
  ProductInUseError,
  ProductNotFoundError,
  ProductNotArchivedError,
  ValidationError,
} from '../../domain/errors.js';
import { detectImageType } from '../../domain/image-type.js';
import { isProductImageType, MAX_PRODUCT_IMAGE_BYTES } from '../../domain/product-image.js';
import { isUniqueViolation } from './database-errors.js';

const MAX_IMAGES = 5;
const AUDIT_ENTITY_TYPE = 'PRODUCT';

export interface ProductActor {
  businessId: string;
  userId: string;
}

function toDto(product: Product, categoryName: string | null): ProductDto {
  const variantStatuses = deriveVariantStatuses(product.variants, product.lowStockThreshold);
  const stockStatus = deriveProductStockStatus(
    product.stockCount,
    product.lowStockThreshold,
    product.variants,
  );
  const availableStock =
    product.variants.length > 0 ? sumVariantStock(product.variants) : product.stockCount;

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    categoryId: product.categoryId,
    categoryName: categoryName ?? null,
    sku: product.sku ?? null,
    price: product.price,
    cost: product.cost ?? null,
    stockCount: product.stockCount,
    lowStockThreshold: product.lowStockThreshold,
    availableStock,
    stockStatus: stockStatus as ProductDto['stockStatus'],
    images: product.images,
    options: product.options,
    variants: product.variants.map((variant, index) => ({
      id: variant.id,
      combination: variant.combination,
      sku: variant.sku ?? null,
      price: variant.price ?? null,
      cost: variant.cost ?? null,
      stockCount: variant.stockCount,
      imageUrl: variant.imageUrl ?? null,
      stockStatus: variantStatuses[index].status as ProductDto['stockStatus'],
    })),
    isArchived: product.isArchived,
    archivedAt: product.archivedAt ? product.archivedAt.toISOString() : null,
    version: product.version,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameOptions(left: ProductOption[], right: ProductOption[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((option, index) => {
    const other = right[index];
    return option.name === other.name && sameStringArray(option.values, other.values);
  });
}

function sameCombination(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function sameVariant(left: ProductVariant, right: ProductVariant): boolean {
  // An omitted imageUrl means "keep the stored image"; an explicit null means
  // "no image". Fold both sides to the stored meaning before comparing so a
  // semantically empty edit does not bump the version (AC-9).
  const imageUnchanged =
    left.imageUrl === undefined || (left.imageUrl ?? null) === (right.imageUrl ?? null);
  return (
    sameCombination(left.combination, right.combination) &&
    left.sku === right.sku &&
    left.price === right.price &&
    left.cost === right.cost &&
    left.stockCount === right.stockCount &&
    imageUnchanged
  );
}

function sameVariants(left: ProductVariant[], right: ProductVariant[]): boolean {
  return (
    left.length === right.length &&
    left.every((variant, index) => sameVariant(variant, right[index]))
  );
}

function skuList(productSku: string | null | undefined, variants: { sku?: string }[]): string[] {
  const skus = variants
    .map((variant) => variant.sku)
    .filter((sku): sku is string => sku !== undefined && sku !== '');
  if (productSku) skus.push(productSku);
  return skus;
}

export class ProductService {
  constructor(
    private readonly repository: IProductRepository,
    private readonly categoryRepository: ICategoryRepository,
    private readonly imageStorage: ProductImageStorage,
  ) {}

  async create(input: ProductCreateRequest, actor: ProductActor): Promise<ProductDto> {
    const category = await this.categoryRepository.findById(input.categoryId);
    if (!category) {
      throw new ValidationError(['categoryId'], 'Category not found in this business');
    }

    await this.assertSkuAvailability(input.sku, input.variants);
    const matrix = validateVariantMatrix(input.options, input.variants);
    const isVariant = matrix.options.length > 0;

    const now = new Date();
    const data: Product = {
      id: '',
      businessId: actor.businessId,
      name: input.name,
      description: input.description,
      categoryId: category.id,
      sku: input.sku,
      price: input.price,
      cost: input.cost,
      stockCount: isVariant ? 0 : input.stockCount,
      lowStockThreshold: input.lowStockThreshold,
      images: input.images,
      options: matrix.options,
      variants: matrix.variants,
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const created = await this.repository.insert(data);
      return toDto(created, category.name);
    } catch (error) {
      if (isUniqueViolation(error)) {
        await this.throwDuplicateFromIndex(skuList(input.sku, matrix.variants), error);
      }
      throw error;
    }
  }

  async get(id: string): Promise<ProductDto> {
    const record = await this.getRecord(id);
    return toDto(record.product, record.categoryName);
  }

  async search(query: ProductListQuery): Promise<ProductPageDto> {
    const q = (query.q ?? '').trim();
    const limit = effectivePageSize(query.limit === undefined ? undefined : Number(query.limit));
    const categoryId = query.categoryId ?? null;
    const stockStatus = (query.stockStatus ?? null) as StockStatus | null;
    const includeArchived = query.includeArchived ?? false;

    if (categoryId) {
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new ValidationError(['categoryId'], 'Category not found in this business');
      }
    }

    let anchor: { name: string; id: string } | undefined;
    if (query.cursor !== undefined && query.cursor !== '') {
      const decoded = decodeProductCursor(
        query.cursor,
        q,
        limit,
        categoryId,
        stockStatus,
        includeArchived,
      );
      if (!decoded) {
        throw new ValidationError(['cursor']);
      }
      anchor = { name: decoded.name, id: decoded.id };
    }

    const result = await this.repository.search({
      q,
      categoryId,
      stockStatus,
      includeArchived,
      limit,
      name: anchor?.name,
      id: anchor?.id,
    });

    const last = result.items[result.items.length - 1];
    const nextCursor =
      result.hasMore && last
        ? encodeProductCursor({
            name: last.product.name,
            id: last.product.id,
            q,
            limit,
            categoryId,
            stockStatus,
            includeArchived,
          })
        : null;

    return {
      items: result.items.map((record) => toDto(record.product, record.categoryName)),
      nextCursor,
    };
  }

  async update(id: string, input: ProductUpdateRequest): Promise<ProductDto> {
    const record = await this.getRecord(id);
    const product = record.product;

    // Archived products are locked before the version check (AC-9).
    if (product.isArchived) {
      throw new ProductArchivedError();
    }

    if (input.version !== product.version) {
      throw new ProductChangedError();
    }

    let categoryName = record.categoryName;
    if (input.categoryId !== undefined && input.categoryId !== product.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId);
      if (!category) {
        throw new ValidationError(['categoryId'], 'Category not found in this business');
      }
      categoryName = category.name;
    }

    const changes: ProductUpdateData = {};
    if (input.name !== undefined && input.name !== product.name) {
      changes.name = input.name;
    }
    if (input.price !== undefined && input.price !== product.price) {
      changes.price = input.price;
    }
    if (input.categoryId !== undefined && input.categoryId !== product.categoryId) {
      changes.categoryId = input.categoryId;
    }
    if (input.cost !== undefined && input.cost !== product.cost) {
      changes.cost = input.cost;
    }
    if (
      input.lowStockThreshold !== undefined &&
      input.lowStockThreshold !== product.lowStockThreshold
    ) {
      changes.lowStockThreshold = input.lowStockThreshold;
    }

    if (input.description !== undefined) {
      if (input.description === null) {
        if (product.description !== undefined) changes.description = null;
      } else if (input.description !== product.description) {
        changes.description = input.description;
      }
    }

    if (input.sku !== undefined) {
      if (input.sku === null) {
        if (product.sku !== undefined) changes.sku = null;
      } else if (input.sku !== product.sku) {
        changes.sku = input.sku;
      }
    }

    if (input.images !== undefined && !sameStringArray(input.images, product.images)) {
      changes.images = input.images;
    }

    let targetOptions = product.options;
    let targetVariants = product.variants;
    let matrixChanged = false;

    // AC-9 orders the checks: SKU uniqueness before variant matrix validity.
    // Lock the current SKUs too so a released value cannot look occupied while
    // the releasing transaction is still open.
    const targetSku = changes.sku !== undefined ? changes.sku : product.sku;
    const nextVariants = input.variants ?? product.variants;
    const currentLockSkus = skuList(product.sku, product.variants);
    await this.assertSkuAvailability(targetSku, nextVariants, id, currentLockSkus);

    if (input.options !== undefined || input.variants !== undefined) {
      const matrix = validateVariantMatrix(input.options ?? product.options, nextVariants);
      targetOptions = matrix.options;
      targetVariants = matrix.variants;
      matrixChanged =
        !sameOptions(matrix.options, product.options) ||
        !sameVariants(matrix.variants, product.variants);
      if (matrixChanged) {
        changes.options = matrix.options;
        changes.variants = matrix.variants;
      }
    }

    const isVariant = targetOptions.length > 0;
    if (matrixChanged) {
      // A variant product stores stockCount 0, so switching back without an
      // explicit stockCount starts from 0 unless the caller supplies one.
      changes.stockCount = isVariant ? 0 : (input.stockCount ?? product.stockCount);
    } else if (
      !isVariant &&
      input.stockCount !== undefined &&
      input.stockCount !== product.stockCount
    ) {
      changes.stockCount = input.stockCount;
    }

    if (Object.keys(changes).length === 0) {
      return toDto(product, categoryName);
    }

    try {
      const updated = await this.repository.update(
        id,
        product.version,
        changes,
        product.version + 1,
        Array.from(new Set([...currentLockSkus, ...skuList(targetSku, targetVariants)])),
      );
      if (!updated) {
        throw new ProductChangedError();
      }
      return toDto(updated, categoryName);
    } catch (error) {
      if (isUniqueViolation(error)) {
        await this.throwDuplicateFromIndex(skuList(targetSku, targetVariants), error, id);
      }
      throw error;
    }
  }

  async archive(id: string, version: number, actor: ProductActor): Promise<ProductDto> {
    const record = await this.getRecord(id);
    if (record.product.isArchived) {
      throw new ProductArchivedError();
    }
    if (version !== record.product.version) {
      throw new ProductChangedError();
    }

    const updated = await this.repository.archiveWithAudit(id, version, {
      businessId: actor.businessId,
      userId: actor.userId,
      action: 'PRODUCT_ARCHIVED',
      entityType: AUDIT_ENTITY_TYPE,
      entityId: id,
    });
    if (!updated) {
      throw new ProductChangedError();
    }
    return toDto(updated, record.categoryName);
  }

  async restore(id: string, version: number, actor: ProductActor): Promise<ProductDto> {
    const record = await this.getRecord(id);

    // The not archived state is checked before the version (AC-10).
    if (!record.product.isArchived) {
      throw new ProductNotArchivedError();
    }
    if (version !== record.product.version) {
      throw new ProductChangedError();
    }

    const updated = await this.repository.restoreWithAudit(id, version, {
      businessId: actor.businessId,
      userId: actor.userId,
      action: 'PRODUCT_RESTORED',
      entityType: AUDIT_ENTITY_TYPE,
      entityId: id,
    });
    if (!updated) {
      throw new ProductChangedError();
    }
    return toDto(updated, record.categoryName);
  }

  async delete(id: string, version: number, actor: ProductActor): Promise<void> {
    const record = await this.getRecord(id);

    // The not archived state is checked before the version (AC-11).
    if (!record.product.isArchived) {
      throw new ProductNotArchivedError();
    }
    if (version !== record.product.version) {
      throw new ProductChangedError();
    }

    // The order guard is an application rule; the repository re-checks it
    // inside the delete transaction as a race-safe backstop.
    if ((await this.repository.countOrderItems(id)) > 0) {
      throw new ProductInUseError();
    }

    const result = await this.repository.deleteWithAudit(id, version, {
      businessId: actor.businessId,
      userId: actor.userId,
      action: 'PRODUCT_DELETED',
      entityType: AUDIT_ENTITY_TYPE,
      entityId: id,
    });
    if (result === 'inUse') {
      throw new ProductInUseError();
    }
    if (result === 'stale') {
      throw new ProductChangedError();
    }
  }

  async addImages(
    id: string,
    files: Buffer[],
    actor: ProductActor,
    version?: number,
  ): Promise<ProductDto> {
    const record = await this.getRecord(id);
    if (record.product.isArchived) {
      throw new ProductArchivedError();
    }
    if (version !== undefined && version !== record.product.version) {
      throw new ProductChangedError();
    }
    if (files.length === 0) {
      throw new ValidationError(['images'], 'At least one image is required');
    }
    if (record.product.images.length + files.length > MAX_IMAGES) {
      throw new ValidationError(['images'], `At most ${MAX_IMAGES} images are allowed`);
    }

    for (const file of files) {
      this.assertProductImage(file, 'images');
    }

    const uploaded: UploadedProductImage[] = [];
    let uploadsHandled = false;
    try {
      for (const file of files) {
        uploaded.push(await this.imageStorage.uploadProductImage(file, actor.businessId));
      }

      const result = await this.repository.appendImages(
        id,
        uploaded.map((image) => image.url),
        MAX_IMAGES,
        version,
      );
      if (result.status !== 'ok') {
        await this.discardUploads(uploaded);
      }
      uploadsHandled = true;
      return this.imageResultToDto(
        result,
        record.categoryName,
        'images',
        'Image index is out of range',
      );
    } catch (error) {
      if (!uploadsHandled) await this.discardUploads(uploaded);
      throw error;
    }
  }

  async removeImage(id: string, index: number, version?: number): Promise<ProductDto> {
    const record = await this.getRecord(id);
    if (record.product.isArchived) {
      throw new ProductArchivedError();
    }
    if (version !== undefined && version !== record.product.version) {
      throw new ProductChangedError();
    }
    if (!Number.isInteger(index) || index < 0 || index >= record.product.images.length) {
      throw new ValidationError(['index'], 'Image index is out of range');
    }

    const result = await this.repository.removeImageAt(id, index, version);
    return this.imageResultToDto(
      result,
      record.categoryName,
      'index',
      'Image index is out of range',
    );
  }

  async setVariantImage(
    id: string,
    variantIndex: number,
    file: Buffer,
    actor: ProductActor,
    version?: number,
  ): Promise<ProductDto> {
    const record = await this.getRecord(id);
    if (record.product.isArchived) {
      throw new ProductArchivedError();
    }
    if (version !== undefined && version !== record.product.version) {
      throw new ProductChangedError();
    }
    if (
      !Number.isInteger(variantIndex) ||
      variantIndex < 0 ||
      variantIndex >= record.product.variants.length
    ) {
      throw new ValidationError(['variantIndex'], 'Variant index is out of range');
    }

    this.assertProductImage(file, 'image');
    const uploaded = await this.imageStorage.uploadProductImage(file, actor.businessId, true);
    let uploadsHandled = false;
    try {
      const result = await this.repository.setVariantImage(id, variantIndex, uploaded.url, version);
      if (result.status !== 'ok') {
        await this.discardUploads([uploaded]);
      }
      uploadsHandled = true;
      return this.imageResultToDto(
        result,
        record.categoryName,
        'variantIndex',
        'Variant index is out of range',
      );
    } catch (error) {
      if (!uploadsHandled) await this.discardUploads([uploaded]);
      throw error;
    }
  }

  /** Never let a cleanup failure hide the real write error. */
  private async discardUploads(images: UploadedProductImage[]): Promise<void> {
    await Promise.allSettled(
      images.map((image) => this.imageStorage.deleteProductImage(image.publicId)),
    );
  }

  private async getRecord(id: string): Promise<ProductRecord> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new ProductNotFoundError();
    }
    return record;
  }

  private imageResultToDto(
    result: ProductImageWriteResult,
    categoryName: string | null,
    rangeField: string,
    rangeMessage: string,
  ): ProductDto {
    switch (result.status) {
      case 'ok':
        return toDto(result.product, categoryName);
      case 'notFound':
        throw new ProductNotFoundError();
      case 'archived':
        throw new ProductArchivedError();
      case 'changed':
        throw new ProductChangedError();
      case 'limit':
        throw new ValidationError(['images'], `At most ${MAX_IMAGES} images are allowed`);
      case 'range':
        throw new ValidationError([rangeField], rangeMessage);
    }
  }

  /**
   * Check every SKU the write would store. Payload-internal duplicates are a
   * validation failure; a clash with another product is a DUPLICATE_SKU.
   */
  private async assertSkuAvailability(
    productSku: string | null | undefined,
    variants: { sku?: string }[],
    excludeProductId?: string,
    extraLockSkus: string[] = [],
  ): Promise<void> {
    const variantSkus = variants
      .map((variant) => variant.sku)
      .filter((sku): sku is string => sku !== undefined && sku !== '');
    const seen = new Set<string>();
    for (const sku of variantSkus) {
      if (seen.has(sku)) {
        throw new ValidationError(['variants'], 'Variant SKUs must be unique');
      }
      seen.add(sku);
    }
    if (productSku && seen.has(productSku)) {
      throw new ValidationError(['sku'], 'Product and variant SKUs must be unique');
    }

    const all = productSku ? [productSku, ...seen] : [...seen];
    // Extra current SKUs are locked so a value being released by another
    // transaction has committed (or rolled back) before we inspect its owner.
    const lockSkus = [...new Set([...all, ...extraLockSkus])];
    if (lockSkus.length === 0) return;

    const owners = await this.repository.checkSkuAvailability(lockSkus, excludeProductId);
    for (const sku of all) {
      const owner = owners.get(sku);
      if (owner) {
        throw new DuplicateSkuError(owner.productId, owner.variantId, owner.archived);
      }
    }
  }

  /** Look up the conflicting record after the unique index rejects a write. */
  private async throwDuplicateFromIndex(
    skus: string[],
    originalError: unknown,
    excludeProductId?: string,
  ): Promise<never> {
    const unique = [...new Set(skus)];
    const owners = await this.repository.findSkuOwners(unique, excludeProductId);
    for (const sku of unique) {
      const owner = owners.get(sku);
      if (owner) {
        throw new DuplicateSkuError(owner.productId, owner.variantId, owner.archived);
      }
    }
    // The violation was not on a SKU index. Surface the original database
    // error instead of inventing a validation message.
    throw originalError;
  }

  private assertProductImage(buffer: Buffer, field: 'images' | 'image'): void {
    if (buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
      throw new ValidationError([field], 'Images must be 2 MB or smaller');
    }
    if (!isProductImageType(detectImageType(buffer))) {
      throw new ValidationError([field], 'Only JPG, PNG, and WebP images are allowed');
    }
  }
}
