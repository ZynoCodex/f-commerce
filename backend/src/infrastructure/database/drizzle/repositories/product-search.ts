import { and, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { products } from '../schema.js';

/** Escape LIKE metacharacters so a prefix search treats them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Build the search predicate for a catalog query. The lower bounds are
 * byte-wise `text_pattern_ops` ranges while the LIKE checks remain the exact
 * filter. Lowercasing happens in PostgreSQL for names, so the pattern agrees
 * with the stored `lower(name)` value even when JavaScript and the database
 * case-fold differently. Both sides use the database default collation; if
 * `products.name` ever gets an explicit COLLATE, move this predicate and the
 * expression index with it. There is deliberately no upper bound: deriving one
 * from a code point depends on the database collation.
 *
 * Keep the pattern parameter bound. The unnamed statement gives a custom plan
 * that folds the parameter, so the planner can derive the byte-wise upper
 * bound. A named prepared statement under a generic plan loses the pattern
 * index and falls back to a filter scan over the ordering index.
 */
export function buildProductSearchCondition(input: string): SQL | undefined {
  const prefix = input.trim();
  if (prefix === '') return undefined;

  const escaped = escapeLike(prefix);
  const skuPrefix = escaped.toUpperCase();

  const nameCondition = and(
    sql`lower(${products.name}) ~>=~ lower(${prefix})`,
    sql`lower(${products.name}) like lower(${escaped}) || '%'`,
  );
  const skuCondition = and(
    sql`${products.sku} ~>=~ ${escaped.toUpperCase()}`,
    sql`${products.sku} like ${skuPrefix + '%'}`,
  );

  return or(nameCondition, skuCondition);
}
