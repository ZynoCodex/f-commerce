import { TenantEntity } from './base.entity.js';

export interface ProductImage {
  url: string;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface ProductVariantImage {
  url: string;
}

export interface ProductVariant {
  /** Set for persisted variants; absent while a variant matrix is being validated. */
  id?: string;
  combination: Record<string, string>;
  sku?: string;
  price?: number;
  cost?: number;
  stockCount: number;
  /** null clears a stored image on update; omitted preserves it. */
  imageUrl?: string | null;
}

export interface Category extends TenantEntity {
  name: string;
  description?: string;
  version: number;
}

export interface Product extends TenantEntity {
  name: string;
  description?: string;
  categoryId: string;
  sku?: string;
  price: number;
  cost?: number;
  stockCount: number;
  lowStockThreshold: number;
  images: string[];
  options: ProductOption[];
  variants: ProductVariant[];
  isArchived: boolean;
  archivedAt?: Date;
  version: number;
}

export enum StockStatus {
  IN_STOCK = 'inStock',
  LOW_STOCK = 'lowStock',
  OUT_OF_STOCK = 'outOfStock',
}

export interface VariantStockStatus {
  index: number;
  status: StockStatus;
  stockCount: number;
}
