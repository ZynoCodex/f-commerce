import type { OrderStatusType } from '@f-commerce/contracts';
import { Badge } from '@/components/ui/primitives';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/order-form';

export function OrderStatusBadge({ status }: { status: OrderStatusType }) {
  return <Badge className={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
