import { Product, ProductVariant, StockStatus } from '../entities/product.entity.js';

/** A product read with its category name resolved for the response DTO. */
export interface ProductRecord {
  product: Product;
  categoryName: string | null;
}

export interface ProductSearchQuery {
  /** Trimmed search text. Empty means no name or SKU prefix match. */
  q: string;
  categoryId: string | null;
  stockStatus: StockStatus | null;
  includeArchived: boolean;
  limit: number;
  /** Cursor anchor: last name and id of the previous page. */
  name?: string;
  id?: string;
}

export interface ProductSearchResult {
  items: ProductRecord[];
  /** One extra row beyond the page size, used to decide whether more exist. */
  hasMore: boolean;
}

export interface ProductUpdateData {
  name?: string;
  description?: string | null;
  categoryId?: string;
  sku?: string | null;
  price?: number;
  cost?: number;
  stockCount?: number;
  lowStockThreshold?: number;
  images?: string[];
  options?: Product['options'];
  variants?: ProductVariant[];
}

/** Who currently holds a SKU, so a duplicate can name the existing record. */
export interface SkuOwner {
  productId: string;
  variantId: string | null;
  archived: boolean;
}

/** The outcome of an image mutation, so races map to the same API errors. */
export type ProductImageWriteResult =
  | { status: 'ok'; product: Product }
  | { status: 'notFound' | 'archived' | 'limit' | 'range' | 'changed' };

export interface ProductAuditEntry {
  businessId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
}

export type ProductDeleteResult = 'deleted' | 'stale' | 'inUse';

export interface IProductRepository {
  findById(id: string): Promise<ProductRecord | null>;
  insert(data: Product): Promise<Product>;
  update(
    id: string,
    expectedVersion: number,
    changes: ProductUpdateData,
    nextVersion: number,
    /** Current and target SKUs, so a released SKU cannot produce a false conflict. */
    lockSkus: string[],
  ): Promise<Product | null>;
  search(query: ProductSearchQuery): Promise<ProductSearchResult>;
  /** Look for every sku across products and variants in one batch. */
  findSkuOwners(skus: string[], excludeProductId?: string): Promise<Map<string, SkuOwner>>;
  /** Lock SKUs and return their owners, so a create waits for a releasing update. */
  checkSkuAvailability(skus: string[], excludeProductId?: string): Promise<Map<string, SkuOwner>>;
  /** Order items in the business that reference this product, for the delete guard. */
  countOrderItems(productId: string): Promise<number>;
  /** Append images to the product row under a lock; optionally check the version. */
  appendImages(
    id: string,
    urls: string[],
    maxImages: number,
    expectedVersion?: number,
  ): Promise<ProductImageWriteResult>;
  /** Remove one image by index under a lock; optionally check the version. */
  removeImageAt(
    id: string,
    index: number,
    expectedVersion?: number,
  ): Promise<ProductImageWriteResult>;
  /** Set one variant image by its stored position under a lock. */
  setVariantImage(
    id: string,
    position: number,
    imageUrl: string,
    expectedVersion?: number,
  ): Promise<ProductImageWriteResult>;
  archiveWithAudit(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
  ): Promise<Product | null>;
  restoreWithAudit(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
  ): Promise<Product | null>;
  deleteWithAudit(
    id: string,
    expectedVersion: number,
    audit: ProductAuditEntry,
  ): Promise<ProductDeleteResult>;
}
