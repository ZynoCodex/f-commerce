'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/shell/shell';
import { Skeleton } from '@/components/ui/primitives';
import { OrderForm } from '@/components/orders/order-form';
import { useRequireAuth } from '@/lib/auth-guard';
import { useBusinessSettings } from '@/components/business/business-settings-provider';

export default function NewOrderPage() {
  const ready = useRequireAuth();
  const router = useRouter();
  const { currency } = useBusinessSettings();

  if (!ready) {
    return (
      <AppShell>
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <Link
          className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-sky-strong hover:underline"
          href="/orders"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to orders
        </Link>

        <header>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sky-strong">New sale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Create order</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-body">
            Pick the customer, add what they bought, and confirm the totals. The order starts as
            pending so it can be confirmed next.
          </p>
        </header>

        <OrderForm
          currency={currency}
          mode="create"
          onSaved={(order) => router.push(`/orders/${order.id}`)}
        />
      </div>
    </AppShell>
  );
}
