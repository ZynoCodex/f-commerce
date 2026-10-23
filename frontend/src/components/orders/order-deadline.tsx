import type { OrderDto, OrderStatusType, OrderSummaryDto } from '@f-commerce/contracts';
import { Badge } from '@/components/ui/primitives';
import { formatDateOnly, isOverdue } from '@/lib/catalog-format';

/**
 * The `Overdue` badge. It is derived at render time from the stored promise and
 * the viewer's local today, so it never needs a stored flag or a timer.
 */
export function OrderDeadlineBadge({
  deliveryDeadline,
  status,
}: {
  deliveryDeadline: string | null;
  status: OrderStatusType;
}) {
  if (!isOverdue(deliveryDeadline, status)) return null;
  return <Badge className="bg-danger-soft text-danger">Overdue</Badge>;
}

/** The promised delivery date with the overdue badge, for a list row. */
export function OrderDeadlineCell({ row }: { row: OrderSummaryDto }) {
  const label = formatDateOnly(row.deliveryDeadline);
  if (label === null) return <span className="text-muted">Not set</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-body">{label}</span>
      <OrderDeadlineBadge deliveryDeadline={row.deliveryDeadline} status={row.status} />
    </span>
  );
}

/** The promised delivery date with the overdue badge, for the detail header. */
export function OrderDeadlineSummary({ order }: { order: OrderDto }) {
  const label = formatDateOnly(order.deliveryDeadline);
  if (label === null) return <span className="text-body">Not set</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-body">{label}</span>
      <OrderDeadlineBadge deliveryDeadline={order.deliveryDeadline} status={order.status} />
    </span>
  );
}
