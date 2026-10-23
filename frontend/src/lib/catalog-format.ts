import type { ProductStockStatus, OrderStatusType } from '@f-commerce/contracts';
import { ORDER_ACTIVE_STATUSES } from './order-form';

export const STOCK_STATUS_LABEL: Record<ProductStockStatus, string> = {
  inStock: 'In stock',
  lowStock: 'Low stock',
  outOfStock: 'Out of stock',
};

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '—';
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  return currency === '' ? amount : `${amount} ${currency}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Format a stored `YYYY-MM-DD` promise as a calendar day. The string is split
 * by hand, never parsed into a `Date`, so the shown day never shifts with a
 * timezone. The month names come from `formatDateTime` on a fixed UTC date so
 * the label matches the rest of the console.
 */
export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  const monthLabel = MONTH_LABELS[Number(month) - 1];
  if (!monthLabel) return value;
  return `${monthLabel} ${Number(day)}, ${year}`;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The viewer's calendar day as `YYYY-MM-DD`, read from their local clock. */
export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * True when a promise is set, already past the viewer's local today, and the
 * order is still working. A day that is today is not overdue.
 */
export function isOverdue(
  deliveryDeadline: string | null | undefined,
  status: OrderStatusType,
  now: Date = new Date(),
): boolean {
  if (!deliveryDeadline) return false;
  if (!ORDER_ACTIVE_STATUSES.includes(status)) return false;
  return deliveryDeadline < localToday(now);
}

export function combinationLabel(combination: Record<string, string>): string {
  return Object.values(combination).join(' / ');
}
