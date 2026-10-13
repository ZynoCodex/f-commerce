'use client';

import { AppShell, DashboardSurface } from '@/components/shell/shell';
import { useRequireAuth } from '@/lib/auth-guard';

export default function DashboardPage() {
  const ready = useRequireAuth();
  if (!ready) return null;

  return (
    <AppShell>
      <DashboardSurface />
    </AppShell>
  );
}
