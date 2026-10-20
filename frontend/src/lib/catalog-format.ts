import type { ProductStockStatus } from '@f-commerce/contracts';

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

export function combinationLabel(combination: Record<string, string>): string {
  return Object.values(combination).join(' / ');
}
