'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Phone } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  RecordCard,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { AppShell } from '@/components/shell/shell';
import { useBusinessSettings } from '@/components/business/business-settings-provider';
import { apiFetch, isTimeoutError } from '@/lib/auth-client';
import { useRequireAuth } from '@/lib/auth-guard';
import { formatDateTime, formatMoney } from '@/lib/catalog-format';
import type { CustomerOrderDto, CustomerProfileDto } from '@f-commerce/contracts';

const PAGE_SIZE = 20;

interface OrderPage {
  items: CustomerOrderDto[];
  nextCursor: string | null;
}

interface EditForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export default function CustomerProfilePage() {
  const ready = useRequireAuth();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { timezone } = useBusinessSettings();

  const [customer, setCustomer] = useState<CustomerProfileDto | null>(null);
  const [orders, setOrders] = useState<OrderPage>({ items: [], nextCursor: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditForm>({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  /** Fetch the customer and its orders together. Throws on a failed request. */
  const fetchProfile = useCallback(async () => {
    const ordersParams = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const [customerRes, ordersRes] = await Promise.all([
      apiFetch(`/api/customers/${customerId}`),
      apiFetch(`/api/customers/${customerId}/orders?${ordersParams.toString()}`),
    ]);

    const customerData = await customerRes.json();
    if (!customerRes.ok) {
      throw new Error(customerData.message || customerData.error || 'Failed to load customer');
    }

    const ordersData = await ordersRes.json();
    if (!ordersRes.ok) {
      throw new Error(ordersData.message || ordersData.error || 'Failed to load orders');
    }

    return {
      customer: customerData.data as CustomerProfileDto,
      orders: {
        items: ordersData.data.items as CustomerOrderDto[],
        nextCursor: ordersData.data.nextCursor as string | null,
      },
    };
  }, [customerId]);

  // Load on mount. State is set from the promise callbacks, so no render is
  // queued synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;

    fetchProfile()
      .then((result) => {
        if (cancelled) return;
        setCustomer(result.customer);
        setOrders(result.orders);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  /** Reload after a change, from an event handler. */
  const reload = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchProfile();
      setCustomer(result.customer);
      setOrders(result.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [fetchProfile]);

  const openEdit = () => {
    if (!customer) return;
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
    setFieldErrors([]);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!customer) return;
    setIsSaving(true);
    setFieldErrors([]);

    try {
      // Empty optional fields are sent as null so the API clears them, and
      // the current version goes along so a stale edit cannot overwrite.
      const res = await apiFetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: customer.version,
          name: form.name,
          phone: form.phone,
          email: form.email.trim() === '' ? null : form.email,
          address: form.address.trim() === '' ? null : form.address,
          notes: form.notes.trim() === '' ? null : form.notes,
        }),
      });
      const data = await res.json();

      if (res.status === 400) {
        setFieldErrors(Array.isArray(data.fields) ? data.fields : []);
        return;
      }

      if (res.status === 409 && data.error === 'CUSTOMER_CHANGED') {
        // Someone else saved first. Reload so the seller sees the newest state.
        setEditOpen(false);
        await reload();
        setNotice('This customer was changed elsewhere. The newest details are shown.');
        return;
      }

      if (res.status === 409 && data.error === 'DUPLICATE_PHONE') {
        setFieldErrors(['phone']);
        return;
      }

      if (res.status === 409 && data.error === 'CUSTOMER_ARCHIVED') {
        setEditOpen(false);
        await reload();
        setNotice('This customer is archived, so the record could not be changed.');
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to save changes');
      }

      // The edit response is a plain customer, so merge it into the profile to
      // keep the spend summary the profile response supplied.
      setCustomer({ ...customer, ...data.data });
      setEditOpen(false);
      setNotice('Customer updated');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * A request timed out, so whether it committed is unknown. Reload and report
   * the state that actually landed rather than assuming the request failed.
   */
  const reconcileAfterTimeout = useCallback(async () => {
    try {
      const result = await fetchProfile();
      setCustomer(result.customer);
      setOrders(result.orders);
      setNotice(
        result.customer.archivedAt
          ? 'That request took too long. We reloaded the customer: they are archived.'
          : 'That request took too long. We reloaded the customer: they are active.',
      );
    } catch {
      setActionError(
        'That request took too long and the customer could not be reloaded. Reload the page to check their state.',
      );
    }
  }, [fetchProfile]);

  const archive = async () => {
    if (!customer) return;
    setIsArchiving(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/customers/${customer.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: customer.version }),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === 'CUSTOMER_CHANGED') {
        await reload();
        setNotice(
          'This customer changed before the archive. Check the newest details and try again.',
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to archive customer');
      }

      setCustomer({ ...customer, ...data.data });
      setNotice('Customer archived. Their orders stay linked.');
    } catch (err) {
      if (isTimeoutError(err)) {
        await reconcileAfterTimeout();
        return;
      }
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsArchiving(false);
    }
  };

  const restore = async () => {
    if (!customer) return;
    setIsArchiving(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/customers/${customer.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: customer.version }),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === 'CUSTOMER_CHANGED') {
        await reload();
        setNotice(
          'This customer changed before the restore. Check the newest details and try again.',
        );
        return;
      }
      if (res.status === 409 && data.error === 'PHONE_IN_USE') {
        setActionError('Another live customer already uses this phone number.');
        return;
      }
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to restore customer');
      }

      setCustomer({ ...customer, ...data.data });
      setNotice('Customer restored and back in your lists.');
    } catch (err) {
      if (isTimeoutError(err)) {
        await reconcileAfterTimeout();
        return;
      }
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsArchiving(false);
    }
  };

  const orderColumns = [
    {
      key: 'orderNumber' as const,
      label: 'Order',
      render: (row: CustomerOrderDto) => (
        <span className="font-mono text-sky-strong">{row.orderNumber}</span>
      ),
    },
    {
      key: 'createdAt' as const,
      label: 'Date',
      render: (row: CustomerOrderDto) => (
        <span className="text-body">{formatDateTime(row.createdAt, timezone)}</span>
      ),
    },
    { key: 'status' as const, label: 'Status' },
    {
      key: 'total' as const,
      label: 'Total',
      render: (row: CustomerOrderDto) => (
        <span className="font-mono text-ink">
          {formatMoney(row.total, customer?.currency ?? 'BDT')}
        </span>
      ),
    },
    {
      key: 'dueAmount' as const,
      label: 'Due',
      render: (row: CustomerOrderDto) => (
        <span className="font-mono text-ink">
          {formatMoney(row.dueAmount, customer?.currency ?? 'BDT')}
        </span>
      ),
    },
  ];

  if (!ready) {
    return (
      <AppShell>
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-8">
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-strong hover:underline"
          href="/customers"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to customers
        </Link>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {error && <ErrorState onRetry={() => void reload()}>{error}</ErrorState>}

        {!isLoading && !error && customer && (
          <>
            <header className="grid gap-4 sm:flex sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-ink">
                    {customer.name}
                  </h1>
                  {customer.archivedAt && <Badge>Archived</Badge>}
                </div>
                <a
                  className="mt-3 inline-flex min-h-11 items-center gap-2 font-mono text-lg text-sky-strong hover:underline"
                  href={`tel:${customer.phone}`}
                >
                  <Phone aria-hidden="true" size={18} />
                  {customer.phone}
                </a>
              </div>
              <div className="flex flex-wrap gap-3">
                {customer.archivedAt ? (
                  <Button disabled={isArchiving} onClick={() => void restore()} type="button">
                    <ArchiveRestore aria-hidden="true" size={18} />
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button onClick={openEdit} type="button" variant="secondary">
                      <Pencil aria-hidden="true" size={16} />
                      Edit
                    </Button>
                    <Button
                      disabled={isArchiving}
                      onClick={() => void archive()}
                      type="button"
                      variant="danger"
                    >
                      <Archive aria-hidden="true" size={16} />
                      Archive
                    </Button>
                  </>
                )}
              </div>
            </header>

            {notice && (
              <Alert variant="success">
                <div className="flex items-center justify-between gap-4">
                  <span>{notice}</span>
                  <Button onClick={() => setNotice(null)} variant="quiet">
                    Dismiss
                  </Button>
                </div>
              </Alert>
            )}

            {actionError && (
              <Alert variant="danger">
                <div className="flex items-center justify-between gap-4">
                  <span>{actionError}</span>
                  <Button onClick={() => setActionError(null)} variant="quiet">
                    Dismiss
                  </Button>
                </div>
              </Alert>
            )}

            {customer.archivedAt && (
              <Alert>
                <div>
                  This customer is archived. They are archived and cannot be used for new
                  transactions.
                </div>
              </Alert>
            )}

            <section aria-labelledby="spend-title" className="grid gap-4">
              <h2 className="text-xl font-semibold text-ink" id="spend-title">
                Spend summary
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="grid gap-2">
                  <p className="text-sm font-semibold text-body">Orders</p>
                  <p className="font-mono text-2xl font-semibold text-ink">{customer.orderCount}</p>
                  <p className="text-sm text-muted">Cancelled and returned orders excluded</p>
                </Card>
                <Card className="grid gap-2">
                  <p className="text-sm font-semibold text-body">Total spent</p>
                  <p className="font-mono text-2xl font-semibold text-ink">
                    {formatMoney(customer.totalSpent, customer.currency)}
                  </p>
                  <p className="text-sm text-muted">Across the orders above</p>
                </Card>
                <Card className="grid gap-2">
                  <p className="text-sm font-semibold text-body">Total due</p>
                  <p className="font-mono text-2xl font-semibold text-ink">
                    {formatMoney(customer.totalDue, customer.currency)}
                  </p>
                  <p className="text-sm text-muted">Still to collect</p>
                </Card>
              </div>
            </section>

            {editOpen ? (
              <Card>
                <form
                  className="grid gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit();
                  }}
                >
                  <h2 className="text-xl font-semibold text-ink">Edit customer</h2>

                  <Field
                    error={fieldErrors.includes('name') ? 'Enter the customer’s name' : undefined}
                    htmlFor="edit-name"
                    label="Name"
                  >
                    <Input
                      id="edit-name"
                      maxLength={120}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      required
                      value={form.name}
                    />
                  </Field>

                  <Field
                    description="Include the country code."
                    error={fieldErrors.includes('phone') ? 'Enter a valid phone number' : undefined}
                    htmlFor="edit-phone"
                    label="Phone"
                  >
                    <Input
                      id="edit-phone"
                      inputMode="tel"
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      required
                      type="tel"
                      value={form.phone}
                    />
                  </Field>

                  <Field
                    error={
                      fieldErrors.includes('email') ? 'Enter a valid email address' : undefined
                    }
                    htmlFor="edit-email"
                    label="Email (optional)"
                  >
                    <Input
                      id="edit-email"
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      type="email"
                      value={form.email}
                    />
                  </Field>

                  <Field
                    description="Clearing a field removes it from the record."
                    htmlFor="edit-address"
                    label="Address (optional)"
                  >
                    <Textarea
                      id="edit-address"
                      maxLength={500}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                      value={form.address}
                    />
                  </Field>

                  <Field htmlFor="edit-notes" label="Notes (optional)">
                    <Textarea
                      id="edit-notes"
                      maxLength={500}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      value={form.notes}
                    />
                  </Field>

                  <div className="flex flex-wrap gap-3">
                    <Button disabled={isSaving} type="submit">
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button onClick={() => setEditOpen(false)} type="button" variant="secondary">
                      Cancel
                    </Button>
                  </div>
                </form>
              </Card>
            ) : (
              <Card className="grid gap-4">
                <h2 className="text-xl font-semibold text-ink">Contact</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-semibold text-body">Email</dt>
                    <dd className="mt-1 text-ink">{customer.email ?? 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-body">Added</dt>
                    <dd className="mt-1 text-ink">
                      {formatDateTime(customer.createdAt, timezone)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-semibold text-body">Address</dt>
                    <dd className="mt-1 whitespace-pre-line text-ink">
                      {customer.address ?? 'Not provided'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-semibold text-body">Notes</dt>
                    <dd className="mt-1 whitespace-pre-line text-ink">
                      {customer.notes ?? 'No notes yet'}
                    </dd>
                  </div>
                </dl>
                {customer.archivedAt && (
                  <p className="border-t border-border pt-4 text-sm text-muted">
                    Archived on {formatDateTime(customer.archivedAt, timezone)}. Their orders stay
                    reachable.
                  </p>
                )}
              </Card>
            )}

            <section aria-labelledby="orders-title" className="grid gap-4">
              <h2 className="text-xl font-semibold text-ink" id="orders-title">
                Order history
              </h2>

              {orders.items.length === 0 ? (
                <EmptyState>
                  <div>
                    <p className="font-semibold text-ink">No orders for this customer yet</p>
                    <p className="mt-1 text-sm text-body">
                      Orders recorded for them will appear here, newest first.
                    </p>
                  </div>
                </EmptyState>
              ) : (
                <Card className="overflow-hidden p-0">
                  <DataTable columns={orderColumns} rows={orders.items} />
                  <div className="grid gap-3 p-4 md:hidden">
                    {orders.items.map((order) => (
                      <RecordCard key={order.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-sm text-sky-strong">{order.orderNumber}</p>
                            <p className="mt-1 text-sm text-body">
                              {formatDateTime(order.createdAt, timezone)}
                            </p>
                          </div>
                          <Badge>{order.status}</Badge>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                          <span className="text-muted">
                            Total {formatMoney(order.total, customer.currency)}
                          </span>
                          <span className="font-mono text-ink">
                            Due {formatMoney(order.dueAmount, customer.currency)}
                          </span>
                        </div>
                      </RecordCard>
                    ))}
                  </div>
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
