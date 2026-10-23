import type { OrderSourceType, OrderStatusType } from '@f-commerce/contracts';

export const ORDER_ACTIVE_STATUSES: OrderStatusType[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
];

export const ORDER_STATUS_LABEL: Record<OrderStatusType, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const ORDER_SOURCE_LABEL: Record<OrderSourceType, string> = {
  FACEBOOK: 'Facebook',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  DIRECT: 'Direct',
  OTHER: 'Other',
};

/**
 * Status choice styling. Values map to semantic tokens in globals.css, so the
 * same classes work in light and dark themes.
 */
export const ORDER_STATUS_TONE: Record<OrderStatusType, string> = {
  PENDING: 'bg-warning-soft text-warning',
  CONFIRMED: 'bg-sky-soft text-sky-strong',
  PROCESSING: 'bg-sky-soft text-sky-strong',
  SHIPPED: 'bg-surface-muted text-ink',
  DELIVERED: 'bg-success-soft text-success',
  CANCELLED: 'bg-danger-soft text-danger',
  RETURNED: 'bg-warning-soft text-warning',
};

const ORDER_TRANSITIONS: Record<OrderStatusType, OrderStatusType[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export function nextOrderStatuses(status: OrderStatusType): OrderStatusType[] {
  return ORDER_TRANSITIONS[status];
}

export function isOrderEditable(status: OrderStatusType): boolean {
  return status === 'PENDING' || status === 'CONFIRMED';
}

export function orderSourceLabel(source: OrderSourceType | null): string {
  return source === null ? 'Not recorded' : ORDER_SOURCE_LABEL[source];
}

/** One variant the seller can choose for a line, with its display label. */
export interface OrderLineVariant {
  id: string;
  label: string;
  price: number | null;
}

/**
 * The form keeps numeric fields as text so a blank override can mean "use the
 * catalog or stored price" and an invalid keystroke never becomes a number.
 */
export interface OrderLineState {
  key: string;
  lineId?: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantLabel: string | null;
  quantity: string;
  unitPrice: string;
  /** Catalog price used when no variant is selected. */
  productPrice: number;
  defaultPrice: number;
  /** Present only for lines added from the catalog picker. */
  variants: OrderLineVariant[];
}

export interface OrderCustomerSelection {
  id: string;
  name: string;
  phone: string;
  address: string | null;
}

export const MAX_MONEY_INPUT = 100_000_000;
export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 1000;

/** Build the label shown for a variant in the product's or line's option order. */
export function variantLabel(
  optionNames: string[],
  combination: Record<string, string>,
): string | null {
  const ordered = optionNames
    .map((name) => combination[name])
    .filter((value): value is string => typeof value === 'string' && value !== '');
  if (ordered.length > 0) return ordered.join(' / ');

  const fallback = Object.values(combination).filter((value) => value !== '');
  return fallback.length > 0 ? fallback.join(' / ') : null;
}

/** Parse a whole amount from an input, or null when it is not a valid amount. */
export function parseMoneyInput(value: string, allowBlank: boolean): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return allowBlank ? 0 : null;
  const amount = Number(trimmed);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_MONEY_INPUT) return null;
  return amount;
}

export function parseQuantityInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const quantity = Number(trimmed);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return null;
  return quantity;
}

/** The unit price a line would use: an override when present, else its default. */
export function effectiveLinePrice(line: OrderLineState): number | null {
  const trimmed = line.unitPrice.trim();
  if (trimmed === '') return line.defaultPrice;
  const price = Number(trimmed);
  if (!Number.isInteger(price) || price < 0 || price > MAX_MONEY_INPUT) return null;
  return price;
}

export function lineSubtotal(line: OrderLineState): number | null {
  const quantity = parseQuantityInput(line.quantity);
  const price = effectiveLinePrice(line);
  if (quantity === null || price === null) return null;
  return quantity * price;
}

export interface OrderFormTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  everyLineValid: boolean;
}

export function computeOrderTotals(
  lines: OrderLineState[],
  deliveryFeeInput: string,
  discountInput: string,
): OrderFormTotals {
  let subtotal = 0;
  let everyLineValid = true;
  for (const line of lines) {
    const lineTotal = lineSubtotal(line);
    if (lineTotal === null) {
      everyLineValid = false;
      continue;
    }
    subtotal += lineTotal;
  }

  const deliveryFee = parseMoneyInput(deliveryFeeInput, true) ?? 0;
  const discount = parseMoneyInput(discountInput, true) ?? 0;
  return {
    subtotal,
    deliveryFee,
    discount,
    total: subtotal + deliveryFee - discount,
    everyLineValid,
  };
}
