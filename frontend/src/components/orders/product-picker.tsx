'use client';

import { useEffect, useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import type { ProductDto } from '@f-commerce/contracts';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui/primitives';
import { listProducts } from '@/lib/catalog-client';
import { formatMoney } from '@/lib/catalog-format';

interface ProductPickerProps {
  currency: string;
  disabled?: boolean;
  /** Return false when every variant of the product is already on the order. */
  onAdd: (product: ProductDto) => boolean;
}

/** Search the live catalog and add one product line at a time. */
export function ProductPicker({ currency, disabled = false, onAdd }: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.trim() === '') {
      return;
    }

    let cancelled = false;

    listProducts({ q: debouncedQuery.trim(), limit: 6 })
      .then((page) => {
        if (cancelled) return;
        setProducts(page.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProducts([]);
        setError(err instanceof Error ? err.message : 'Products could not be searched');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const clearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
    setProducts([]);
    setError(null);
  };

  return (
    <div className="grid gap-3">
      <Field
        description="Search by product name or SKU. Archived products cannot be added."
        htmlFor="order-product-search"
        label="Add a product"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            size={18}
          />
          <Input
            autoComplete="off"
            className="pl-10"
            disabled={disabled}
            id="order-product-search"
            onChange={(event) => {
              const value = event.target.value;
              setNotice(null);
              setQuery(value);
              setIsLoading(value.trim() !== '');
            }}
            placeholder="Search the catalog"
            type="search"
            value={query}
          />
        </div>
      </Field>

      {notice !== null && <Alert>{notice}</Alert>}
      {error !== null && <Alert variant="danger">{error}</Alert>}

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Spinner /> Searching products…
        </p>
      )}

      {debouncedQuery.trim() !== '' && !isLoading && error === null && products.length === 0 && (
        <p className="text-sm text-body">No live products match that search.</p>
      )}

      {products.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {products.map((product) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={product.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-dashed border-border bg-surface-muted text-muted">
                  <Package aria-hidden="true" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{product.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {product.sku ?? 'No SKU'} · {formatMoney(product.price, currency)}
                    {product.variants.length > 0
                      ? ` · ${product.variants.length} variant${product.variants.length === 1 ? '' : 's'}`
                      : ' · single item'}
                  </p>
                </div>
              </div>
              <Button
                disabled={disabled}
                onClick={() => {
                  const added = onAdd(product);
                  if (!added) {
                    setNotice('That item is already on the order.');
                    return;
                  }
                  clearSearch();
                }}
                type="button"
                variant="secondary"
              >
                <Plus aria-hidden="true" size={16} />
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
