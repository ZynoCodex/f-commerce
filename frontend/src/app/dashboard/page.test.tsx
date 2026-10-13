import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeBoundary } from '@/components/theme/theme';
import { setAuth } from '@/lib/auth-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import DashboardPage from './page';

describe('DashboardPage', () => {
  beforeEach(() => {
    // DashboardPage now guards on auth before rendering the shell.
    setAuth({ accessToken: 'tok', businessId: 'biz-1' });
  });

  it('renders the order desk shell with the dashboard link marked current', () => {
    render(
      <ThemeBoundary>
        <DashboardPage />
      </ThemeBoundary>,
    );

    expect(screen.getByRole('heading', { name: /keep today moving/i })).toBeVisible();

    // the dashboard link appears in both the desktop primary nav and the mobile nav
    const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('exposes the settings link through the more sheet', async () => {
    const user = userEvent.setup();
    render(
      <ThemeBoundary>
        <DashboardPage />
      </ThemeBoundary>,
    );

    // Settings lives in the "More" sheet; open it (also duplicated across navs)
    await user.click(screen.getAllByRole('button', { name: /more/i })[0]);
    const settings = screen.getByRole('link', { name: /settings/i });
    expect(settings).toHaveAttribute('href', '/settings');
  });
});
