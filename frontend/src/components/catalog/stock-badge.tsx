import type { ProductStockStatus } from '@f-commerce/contracts';
import { Badge } from '@/components/ui/primitives';
import { STOCK_STATUS_LABEL } from '@/lib/catalog-format';

const STYLES: Record<ProductStockStatus, string> = {
  inStock: 'bg-success-soft text-success',
  lowStock: 'bg-warning-soft text-warning',
  outOfStock: 'bg-danger-soft text-danger',
};

export function StockBadge({ status }: { status: ProductStockStatus }) {
  return <Badge className={STYLES[status]}>{STOCK_STATUS_LABEL[status]}</Badge>;
}
