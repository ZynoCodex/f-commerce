'use client';

import { useEffect, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import type { CustomerDto } from '@f-commerce/contracts';
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/auth-client';
import type { OrderCustomerSelection } from '@/lib/order-form';

interface CustomerPickerProps {
  disabled?: boolean;
  onSelect: (customer: OrderCustomerSelection | null) => void;
  selected: OrderCustomerSelection | null;
}

function toSelection(customer: CustomerDto): OrderCustomerSelection {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
  };
}

/**
 * Search the active customer list and pick one. A selected customer shows the
 * values the order snapshots come from, with a Change control to search again.
 */
export function CustomerPicker({ disabled = false, onSelect, selected }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<CustomerDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (selected !== null || debouncedQuery.trim() === '') {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ q: debouncedQuery.trim(), limit: '6' });

    apiFetch(`/api/customers?${params.toString()}`)
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const record =
            typeof payload === 'object' && payload !== null
              ? (payload as { message?: unknown; error?: unknown })
              : {};
          throw new Error(
            typeof record.message === 'string'
              ? record.message
              : typeof record.error === 'string'
                ? record.error
                : 'Customers could not be searched',
          );
        }
        const data =
          typeof payload === 'object' && payload !== null
            ? (payload as { data?: { items?: CustomerDto[] } }).data
            : undefined;
        if (cancelled) return;
        setResults(Array.isArray(data?.items) ? data.items : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResults([]);
        setError(err instanceof Error ? err.message : 'Customers could not be searched');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selected]);

  if (selected !== null) {
    return (
      <Card className="grid gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted">Customer</p>
            <p className="mt-1 text-lg font-semibold text-ink">{selected.name}</p>
            <p className="mt-1 font-mono text-sm text-sky-strong">{selected.phone}</p>
            {selected.address !== null && selected.address.trim() !== '' && (
              <p className="mt-2 max-w-prose whitespace-pre-line text-sm text-body">
                {selected.address}
              </p>
            )}
          </div>
          <Button
            disabled={disabled}
            onClick={() => {
              setQuery('');
              setDebouncedQuery('');
              setResults([]);
              setError(null);
              onSelect(null);
            }}
            type="button"
            variant="secondary"
          >
            Change
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      <Field
        description="Only active customers can receive a new order."
        htmlFor="order-customer-search"
        label="Find the customer"
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
            id="order-customer-search"
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setIsLoading(value.trim() !== '');
            }}
            placeholder="Search by name or phone"
            type="search"
            value={query}
          />
        </div>
      </Field>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Spinner /> Searching customers…
        </p>
      )}

      {error !== null && <Alert variant="danger">{error}</Alert>}

      {debouncedQuery.trim() !== '' && !isLoading && error === null && results.length === 0 && (
        <p className="text-sm text-body">No active customers match that search.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky"
                onClick={() => {
                  onSelect(toSelection(customer));
                  setQuery('');
                  setDebouncedQuery('');
                  setResults([]);
                }}
                type="button"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-soft text-sky-strong">
                  <UserRound aria-hidden="true" size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{customer.name}</span>
                  <span className="block font-mono text-sm text-body">{customer.phone}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
