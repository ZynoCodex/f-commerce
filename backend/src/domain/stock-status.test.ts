import { describe, expect, it } from 'vitest';
import {
  deriveProductStockStatus,
  deriveStockStatus,
  deriveVariantStatuses,
  sumVariantStock,
} from './stock-status.js';
import { StockStatus } from './entities/product.entity.js';

describe('deriveStockStatus', () => {
  it('uses the threshold boundaries for a non variant product', () => {
    expect(deriveStockStatus(0, 5)).toBe(StockStatus.OUT_OF_STOCK);
    expect(deriveStockStatus(1, 5)).toBe(StockStatus.LOW_STOCK);
    expect(deriveStockStatus(5, 5)).toBe(StockStatus.LOW_STOCK);
    expect(deriveStockStatus(6, 5)).toBe(StockStatus.IN_STOCK);
  });
});

describe('deriveProductStockStatus', () => {
  it('uses the product count when there are no variants', () => {
    expect(deriveProductStockStatus(4, 5, [])).toBe(StockStatus.LOW_STOCK);
    expect(deriveProductStockStatus(0, 5, [])).toBe(StockStatus.OUT_OF_STOCK);
  });

  it('aggregates variants against the product threshold and ignores the product count', () => {
    expect(deriveProductStockStatus(999, 5, [{ stockCount: 0 }, { stockCount: 0 }])).toBe(
      StockStatus.OUT_OF_STOCK,
    );
    expect(deriveProductStockStatus(999, 5, [{ stockCount: 0 }, { stockCount: 1 }])).toBe(
      StockStatus.LOW_STOCK,
    );
    expect(deriveProductStockStatus(0, 5, [{ stockCount: 0 }, { stockCount: 6 }])).toBe(
      StockStatus.IN_STOCK,
    );
    expect(deriveProductStockStatus(0, 5, [{ stockCount: 2 }, { stockCount: 4 }])).toBe(
      StockStatus.LOW_STOCK,
    );
  });
});

describe('variant helpers', () => {
  it('derives each variant status and sums available stock', () => {
    const variants = [{ stockCount: 0 }, { stockCount: 2 }, { stockCount: 10 }];
    expect(deriveVariantStatuses(variants, 5).map((entry) => entry.status)).toEqual([
      StockStatus.OUT_OF_STOCK,
      StockStatus.LOW_STOCK,
      StockStatus.IN_STOCK,
    ]);
    expect(sumVariantStock(variants)).toBe(12);
  });
});
