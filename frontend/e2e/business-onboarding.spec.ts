import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// E2E for the onboarding + settings flow (spec 0004).
// Requires the dev stack: backend on :4000, frontend on :3000, PostgreSQL running.
// Covers AC-1, AC-3, AC-4, AC-5, AC-6. Run with: npm run e2e --workspace @f-commerce/frontend

test.use({ baseURL: 'http://localhost:3000' });

test.describe('business onboarding flow', () => {
  const password = 'password123';

  // Helper to authenticate a user (register or login) and return auth state
  async function authenticateUser(
    apiRequest: APIRequestContext,
    email: string,
    businessName: string,
  ) {
    // Try to register first
    const registerRes = await apiRequest.post('/api/auth/register', {
      data: { email, password, name: email.split('@')[0], businessName },
    });

    const data = await registerRes.json();
    if (!registerRes.ok() && data.error?.includes('already')) {
      // If duplicate, try login
      const loginRes = await apiRequest.post('/api/auth/login', {
        data: { email, password },
      });
      const loginData = await loginRes.json();
      try {
        const payload = Buffer.from(loginData.accessToken.split('.')[1], 'base64').toString();
        const parsed = JSON.parse(payload);
        return {
          accessToken: loginData.accessToken,
          businessId: parsed.memberships?.[0]?.businessId,
        };
      } catch {
        return { accessToken: loginData.accessToken, businessId: loginData.businessId };
      }
    }

    try {
      const payload = Buffer.from(data.accessToken.split('.')[1], 'base64').toString();
      const parsed = JSON.parse(payload);
      return { accessToken: data.accessToken, businessId: parsed.memberships?.[0]?.businessId };
    } catch {
      return { accessToken: data.accessToken, businessId: data.businessId };
    }
  }

  // Helper to set auth state in browser context
  async function setAuthState(
    page: import('@playwright/test').Page,
    accessToken: string,
    businessId: string,
  ) {
    await page.addInitScript(
      (auth) => {
        window.localStorage.setItem('accessToken', auth.accessToken);
        window.localStorage.setItem('businessId', auth.businessId);
      },
      { accessToken, businessId },
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('owner who completed onboarding lands on the dashboard, not the wizard', async ({
    page,
    request: apiRequest,
  }) => {
    const email = `completed-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Completed E2E Co',
    );
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    // Complete onboarding via API
    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Completed E2E Co',
        currency: 'USD',
        timezone: 'Asia/Dhaka',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);

    await page.goto('/onboarding');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /keep today moving/i })).toBeVisible();
  });

  // Covers the post sign in redirect: the destination is chosen from the profile,
  // so a completed owner never sees the wizard after typing their password.
  test('signing in sends a completed owner to the dashboard and a fresh one to the wizard', async ({
    page,
    request: apiRequest,
  }, testInfo) => {
    const completeEmail = `signin-done-${randomUUID().slice(0, 8)}@example.com`;
    const freshEmail = `signin-new-${randomUUID().slice(0, 8)}@example.com`;

    const complete = await authenticateUser(apiRequest, completeEmail, 'Sign In Done Co');
    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Sign In Done Co',
        currency: 'BDT',
        timezone: 'Europe/Berlin',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: {
        Authorization: `Bearer ${complete.accessToken}`,
        'x-business-id': complete.businessId,
      },
    });
    // Registered but unfinished, so signing in must still open the wizard.
    await authenticateUser(apiRequest, freshEmail, 'Sign In New Co');

    const signIn = async (email: string) => {
      await page.goto('/login');
      await page.getByRole('textbox', { name: /email/i }).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /^sign in$/i }).click();
    };

    const wizardSeen: boolean[] = [];
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame() && /\/onboarding/.test(frame.url())) wizardSeen.push(true);
    });

    await signIn(completeEmail);
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /keep today moving/i })).toBeVisible();
    expect(wizardSeen).toEqual([]);

    // covers AC-7: the provider loads the profile after setAuth without a layout
    // remount, so the shell shows the fetched zone and currency.
    const badge =
      testInfo.project.name === 'desktop'
        ? page.getByRole('complementary', { name: 'Sidebar' }).getByText('Europe/Berlin · BDT')
        : page.getByRole('banner').getByText('Europe/Berlin · BDT');
    await expect(badge).toBeVisible();

    // A fresh session for the unfinished owner.
    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await signIn(freshEmail);
    await page.waitForURL(/\/onboarding$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /welcome, sign in new co/i })).toBeVisible();
  });

  test('a fresh owner walks the wizard to completion and reaches the dashboard', async ({
    page,
    request: apiRequest,
  }, testInfo) => {
    const email = `fresh-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(apiRequest, email, 'Fresh E2E Co');
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    await setAuthState(page, accessToken, businessId);

    await page.goto('/onboarding');

    // Step 1: welcome screen with the name pre-filled from registration
    await page.getByRole('heading', { name: /welcome, fresh e2e co/i }).waitFor();
    await page.getByRole('button', { name: /get started/i }).click();

    // Step 2: address
    await page.getByRole('heading', { name: /billing address/i }).waitFor();
    await page.getByRole('textbox', { name: /street/i }).fill('1 Test Street');
    await page.getByRole('textbox', { name: /city/i }).fill('Dhaka');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 3: currency and timezone (skip logo for this test)
    await page.getByRole('heading', { name: /your currency, timezone, and logo/i }).waitFor();
    await page.getByRole('combobox', { name: /currency/i }).selectOption('BDT');
    await page.getByRole('combobox', { name: /timezone/i }).selectOption('America/New_York');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 4: review and finish
    await page.getByRole('heading', { name: /review and finish/i }).waitFor();
    await expect(page.getByText('Fresh E2E Co')).toBeVisible();
    await expect(page.getByText('BDT · America/New_York')).toBeVisible();
    await page.getByRole('button', { name: /enter order desk/i }).click();

    await page.waitForURL('/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /keep today moving/i })).toBeVisible();

    // The workspace badge lives in the sidebar on desktop and in the header on mobile.
    const badge =
      testInfo.project.name === 'desktop'
        ? page.getByRole('complementary', { name: 'Sidebar' }).getByText('America/New_York · BDT')
        : page.getByRole('banner').getByText('America/New_York · BDT');
    await expect(badge).toBeVisible();
  });

  test('logo upload succeeds during onboarding step 3', async ({ page, request: apiRequest }) => {
    const email = `logo-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(apiRequest, email, 'Logo E2E Co');
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    await setAuthState(page, accessToken, businessId);

    await page.goto('/onboarding');

    // Step 1: welcome screen
    await page.getByRole('heading', { name: /welcome, logo e2e co/i }).waitFor();
    await page.getByRole('button', { name: /get started/i }).click();

    // Fill step 2
    await page.getByRole('heading', { name: /billing address/i }).waitFor();
    await page.getByRole('textbox', { name: /street/i }).fill('1 Test Street');
    await page.getByRole('textbox', { name: /city/i }).fill('Dhaka');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 3: upload logo
    await page.getByRole('heading', { name: /your currency, timezone, and logo/i }).waitFor();
    await page.getByRole('combobox', { name: /currency/i }).selectOption('USD');

    // Create a valid 1x1 PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(pngBase64, 'base64');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-logo.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    await page.waitForSelector('img[alt="Logo preview"]', { state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /^continue$/i }).click();

    await page.getByRole('heading', { name: /review and finish/i }).waitFor();
  });

  test('owner edits the profile from settings and sees confirmation', async ({
    page,
    request: apiRequest,
  }) => {
    const email = `settings-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Settings E2E Co',
    );

    // Complete onboarding first
    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Settings E2E Co',
        currency: 'USD',
        timezone: 'Asia/Dhaka',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);

    await page.goto('/settings');

    const name = page.getByRole('textbox', { name: /business name/i });
    await name.fill('Renamed E2E');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByRole('status').filter({ hasText: /profile updated/i })).toBeVisible();
  });

  test('owner changes the timezone from settings after confirming', async ({
    page,
    request: apiRequest,
  }, testInfo) => {
    const email = `tz-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Timezone E2E Co',
    );

    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Timezone E2E Co',
        currency: 'BDT',
        timezone: 'Asia/Dhaka',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);
    await page.goto('/settings');

    const timezone = page.getByRole('combobox', { name: /timezone/i });
    await expect(timezone).toHaveValue('Asia/Dhaka');

    // Cancel closes the dialog, keeps the stored zone, and reverts the select.
    await timezone.selectOption('America/New_York');
    await page.getByRole('button', { name: /save changes/i }).click();

    const dialog = page.getByRole('dialog', { name: /change the business timezone/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/new timezone: america\/new_york/i)).toBeVisible();
    await expect(dialog.getByText(/existing order dates do not change/i)).toBeVisible();
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(timezone).toHaveValue('Asia/Dhaka');

    // Confirm saves the chosen zone and shows the profile success message.
    await timezone.selectOption('America/New_York');
    await page.getByRole('button', { name: /save changes/i }).click();
    await page
      .getByRole('dialog', { name: /change the business timezone/i })
      .getByRole('button', { name: /change timezone/i })
      .click();

    await expect(page.getByRole('status').filter({ hasText: /profile updated/i })).toBeVisible();

    if (testInfo.project.name === 'desktop') {
      const sidebar = page.getByRole('complementary', { name: /sidebar/i });
      await expect(sidebar.getByText('America/New_York · BDT')).toBeVisible();
    } else {
      await expect(page.locator('header').getByText('America/New_York · BDT')).toBeVisible();
    }

    await page.reload();
    await expect(page.getByRole('combobox', { name: /timezone/i })).toHaveValue('America/New_York');
  });

  // covers AC-6: a failed confirmed change closes the dialog, surfaces the page error,
  // keeps the chosen value, and returns focus to the save button
  test('a failed timezone change closes the dialog and keeps the chosen zone', async ({
    page,
    request: apiRequest,
  }) => {
    const email = `tz-fail-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Timezone Fail E2E Co',
    );

    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Timezone Fail E2E Co',
        currency: 'BDT',
        timezone: 'Asia/Dhaka',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);
    await page.goto('/settings');

    const timezone = page.getByRole('combobox', { name: /timezone/i });
    await expect(timezone).toHaveValue('Asia/Dhaka');

    // Fail only the save, so the profile load still succeeds.
    await page.route('**/api/business/me', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid input', message: 'Timezone update failed' }),
        });
        return;
      }
      await route.continue();
    });

    await timezone.selectOption('Europe/Berlin');
    const save = page.getByRole('button', { name: /save changes/i });
    await save.click();

    const dialog = page.getByRole('dialog', { name: /change the business timezone/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /change timezone/i }).click();

    const alert = page.getByRole('alert').filter({ hasText: /timezone update failed/i });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/timezone update failed/i);
    await expect(dialog).not.toBeVisible();
    await expect(timezone).toHaveValue('Europe/Berlin');
    await expect(save).toBeFocused();
  });

  test('draft saves and resumes on next visit', async ({ page, request: apiRequest }) => {
    const email = `draft-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(apiRequest, email, 'Draft E2E Co');
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    await setAuthState(page, accessToken, businessId);

    // Start onboarding and partially fill the address
    await page.goto('/onboarding');
    await page.getByRole('heading', { name: /welcome, draft e2e co/i }).waitFor();
    await page.getByRole('button', { name: /get started/i }).click();

    const draftSaved = page.waitForResponse(
      (res) =>
        res.url().includes('/api/business/onboarding/draft') && res.request().method() === 'PUT',
    );
    await page.getByRole('textbox', { name: /street/i }).fill('50 Draft Lane');
    await draftSaved;

    await page.reload();

    // Draft values should be restored on the next visit
    await page.getByRole('heading', { name: /welcome, draft e2e co/i }).waitFor();
    await page.getByRole('button', { name: /get started/i }).click();
    await expect(page.getByRole('textbox', { name: /street/i })).toHaveValue('50 Draft Lane');

    await page.getByRole('textbox', { name: /city/i }).fill('Dhaka');
    await page.getByRole('button', { name: /^continue$/i }).click();

    await page.getByRole('heading', { name: /your currency, timezone, and logo/i }).waitFor();
  });

  // covers AC-5: a fresh wizard prefills the browser zone, and a saved draft
  // wins over that prefill after a reload.
  test('prefills the browser timezone and resumes the chosen zone from the draft', async ({
    browser,
    request: apiRequest,
  }) => {
    const email = `tz-draft-${randomUUID().slice(0, 8)}@example.com`;
    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Timezone Draft E2E Co',
    );
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    const context = await browser.newContext({
      baseURL: 'http://localhost:3000',
      timezoneId: 'Europe/Berlin',
    });
    const page = await context.newPage();

    try {
      await setAuthState(page, accessToken, businessId);
      await page.goto('/onboarding');
      await page.getByRole('heading', { name: /welcome, timezone draft e2e co/i }).waitFor();
      await page.getByRole('button', { name: /get started/i }).click();

      await page.getByRole('heading', { name: /billing address/i }).waitFor();
      await page.getByRole('textbox', { name: /street/i }).fill('1 Zone Street');
      await page.getByRole('textbox', { name: /city/i }).fill('Berlin');
      await page.getByRole('button', { name: /^continue$/i }).click();

      await page.getByRole('heading', { name: /your currency, timezone, and logo/i }).waitFor();
      const timezone = page.getByRole('combobox', { name: /timezone/i });
      await expect(timezone).toHaveValue('Europe/Berlin');

      const draftSaved = page.waitForResponse(
        (res) =>
          res.url().includes('/api/business/onboarding/draft') && res.request().method() === 'PUT',
      );
      await timezone.selectOption('America/New_York');
      await draftSaved;

      await page.reload();
      await page.getByRole('heading', { name: /welcome, timezone draft e2e co/i }).waitFor();
      await page.getByRole('button', { name: /get started/i }).click();

      await page.getByRole('heading', { name: /billing address/i }).waitFor();
      await page.getByRole('textbox', { name: /city/i }).fill('Berlin');
      await page.getByRole('button', { name: /^continue$/i }).click();

      await page.getByRole('heading', { name: /your currency, timezone, and logo/i }).waitFor();
      await expect(page.getByRole('combobox', { name: /timezone/i })).toHaveValue(
        'America/New_York',
      );
    } finally {
      await context.close();
    }
  });

  // covers AC-6 and AC-11: a corrupt stored zone falls back to Asia/Dhaka in
  // the settings field and the shell, then a normal save persists the fallback.
  test('a corrupt stored timezone falls back to Asia/Dhaka without a crash', async ({
    page,
    request: apiRequest,
  }, testInfo) => {
    const email = `tz-corrupt-${randomUUID().slice(0, 8)}@example.com`;
    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Corrupt Zone E2E Co',
    );

    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Corrupt Zone E2E Co',
        currency: 'BDT',
        timezone: 'Asia/Dhaka',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);

    await page.route('**/api/business/me', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              name: 'Corrupt Zone E2E Co',
              currency: 'BDT',
              timezone: 'Mars/Olympus',
              logoUrl: null,
              address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
              onboardingComplete: true,
            },
            message: 'Business profile retrieved',
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/settings');
    await expect(page.getByRole('combobox', { name: /timezone/i })).toHaveValue('Asia/Dhaka');
    await expect(page.getByText(/failed to load business/i)).toHaveCount(0);

    const badge =
      testInfo.project.name === 'desktop'
        ? page.getByRole('complementary', { name: 'Sidebar' }).getByText('Asia/Dhaka · BDT')
        : page.getByRole('banner').getByText('Asia/Dhaka · BDT');
    await expect(badge).toBeVisible();

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /profile updated/i })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
