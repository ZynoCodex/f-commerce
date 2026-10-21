import { StockStatus, VariantStockStatus } from './entities/product.entity.js';

/**
 * Derived stock status for a single item with a stock count and threshold.
 * - outOfStock when stockCount is 0
 * - lowStock when stockCount > 0 and stockCount <= lowStockThreshold
 * - inStock when stockCount > lowStockThreshold
 */
export function deriveStockStatus(stockCount: number, lowStockThreshold: number): StockStatus {
  if (stockCount <= 0) return StockStatus.OUT_OF_STOCK;
  if (stockCount <= lowStockThreshold) return StockStatus.LOW_STOCK;
  return StockStatus.IN_STOCK;
}

/**
 * Derived stock status for a variant product:
 * - outOfStock when every variant is out
 * - lowStock when at least one variant is low and none are in stock
 * - inStock when at least one variant is in stock
 */
export function deriveVariantProductStatus(
  variants: { stockCount: number }[],
  lowStockThreshold: number,
): StockStatus {
  const statuses = variants.map((v) => deriveStockStatus(v.stockCount, lowStockThreshold));

  const hasInStock = statuses.some((s) => s === StockStatus.IN_STOCK);
  const allOutOfStock = statuses.every((s) => s === StockStatus.OUT_OF_STOCK);

  if (allOutOfStock) return StockStatus.OUT_OF_STOCK;
  if (hasInStock) return StockStatus.IN_STOCK;
  return StockStatus.LOW_STOCK;
}

/**
 * Aggregate stock status for a product, considering whether it has variants.
 * For non-variant products, uses the product-level stockCount.
 * For variant products, aggregates per-variant statuses against the product
 * threshold.
 */
export function deriveProductStockStatus(
  stockCount: number,
  lowStockThreshold: number,
  variants: { stockCount: number }[],
): StockStatus {
  if (variants.length === 0) {
    return deriveStockStatus(stockCount, lowStockThreshold);
  }
  return deriveVariantProductStatus(variants, lowStockThreshold);
}

/**
 * Compute per-variant stock statuses for display.
 */
export function deriveVariantStatuses(
  variants: { stockCount: number }[],
  lowStockThreshold: number,
): VariantStockStatus[] {
  return variants.map((variant, index) => ({
    index,
    status: deriveStockStatus(variant.stockCount, lowStockThreshold),
    stockCount: variant.stockCount,
  }));
}

/**
 * Sum of variant stock counts, used for availableStock on variant products.
 */
export function sumVariantStock(variants: { stockCount: number }[]): number {
  return variants.reduce((sum, v) => sum + Math.max(0, v.stockCount), 0);
}
