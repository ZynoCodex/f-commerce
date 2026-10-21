/**
 * SKU normalization: trim and uppercase for storage and comparison.
 * A blank SKU after trimming is treated as absent.
 */
export function normalizeSku(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed.toUpperCase();
}
